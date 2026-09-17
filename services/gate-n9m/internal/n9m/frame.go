// Package n9m implements framing for Streamax's N9M 2.0 protocol.
//
// # What the spec says
//
// Chapter 02 describes a 12-byte big-endian header:
//
//	bits  1-2   V             version, "the protocol version is 1"
//	bit   3     P             1 = encrypted
//	bit   4     M             1 = gzip compressed
//	bits  5-8   CSRC COUNT    "the current value is 8"
//	bits  9-16  PAYLOAD TYPE  0 = JSON command, 2 = live video, ...
//	bits 17-32  SSRC
//	bits 33-64  PAYLOAD LEN
//	bits 65-96  RESERVE       "the current value is 0"
//
// # What the wire says
//
// An M1N2.0-STANDARD running protocol 1.0.6 sends this on CONNECT:
//
//	08 00 00 00  00 00 01 be  52 00 00 00
//	^^           ^^^^^^^^^^^  ^^
//	byte 0       len = 446    "RESERVE"
//
// Confirmed, because the capture was exactly 458 bytes and 12 + 446 adds up:
// the header is 12 bytes, PAYLOAD LEN sits at offset 4 big-endian, PAYLOAD TYPE
// at offset 1 and SSRC at offsets 2-3.
//
// Contradicted, in every capture without exception:
//
//   - Byte 0 is 0x08, not 0x4X. Per the table, V=1 would set the top two bits
//     to 01. Read literally, 0x08 means V=0 and CSRC COUNT=8, which cannot be:
//     there is not a single CSRC byte between the header and the JSON.
//   - RESERVE is not zero, it is 52 00 00 00.
//
// # What we do about it
//
// Use what is confirmed, record what is not:
//
//   - No version check. The one we had rejected every connection from the real
//     device. Only the size limit guards against losing frame sync now.
//   - Compression is detected by the gzip signature rather than by bit M, whose
//     position we cannot pin down from frames where nearly everything is zero.
//   - CSRC is treated as absent, because that is what the data shows.
//   - RawFlags and Reserved keep the bytes as they arrived, so that a video or
//     compressed frame can later settle what each bit means.
//
// None of this is confirmed with the manufacturer.
package n9m

import (
	"bytes"
	"compress/gzip"
	"encoding/binary"
	"fmt"
	"io"
)

// HeaderSize is the fixed part preceding the payload. Confirmed on the wire.
const HeaderSize = 12

// MaxPayloadSize keeps a misread header from turning into a gigabyte
// allocation. With the version check gone this is the only defense against
// losing frame sync, so it is generous but not unbounded.
const MaxPayloadSize = 16 << 20

// ObservedFlags is byte 0 as the M1N2.0 sends it on command frames. We use the
// same value when replying: speaking the device's dialect is safer than
// insisting on the table, since the device decides what it accepts.
const ObservedFlags byte = 0x08

// ObservedReserved is the RESERVE field as the device sends it, despite the
// spec calling it zero.
var ObservedReserved = [4]byte{0x52, 0x00, 0x00, 0x00}

var gzipMagic = []byte{0x1f, 0x8b}

// PayloadType tells what follows the header (chapter 02).
type PayloadType uint8

const (
	PayloadCommand      PayloadType = 0
	PayloadLiveVideo    PayloadType = 2
	PayloadRecording    PayloadType = 3
	PayloadPlayback     PayloadType = 4
	PayloadSnapshot     PayloadType = 6
	PayloadParamImport  PayloadType = 10
	PayloadParamExport  PayloadType = 11
	PayloadVideoSubflow PayloadType = 15
	PayloadRecSubflow   PayloadType = 16
	PayloadBlackBox     PayloadType = 17
	PayloadSpecial      PayloadType = 22
	PayloadMaintenance  PayloadType = 30
)

var payloadNames = map[PayloadType]string{
	PayloadCommand:      "command",
	PayloadLiveVideo:    "live-video",
	PayloadRecording:    "recording",
	PayloadPlayback:     "playback",
	PayloadSnapshot:     "snapshot",
	PayloadParamImport:  "param-import",
	PayloadParamExport:  "param-export",
	PayloadVideoSubflow: "video-subflow",
	PayloadRecSubflow:   "recording-subflow",
	PayloadBlackBox:     "black-box",
	PayloadSpecial:      "special",
	PayloadMaintenance:  "maintenance",
}

func (t PayloadType) String() string {
	if name, ok := payloadNames[t]; ok {
		return name
	}
	return fmt.Sprintf("unknown(%d)", uint8(t))
}

// Header is the 12-byte prefix split into fields. Fields the spec describes and
// the wire confirms get names; the rest stays raw.
type Header struct {
	RawFlags   byte // byte 0: V, P, M and CSRC bits, still undeciphered
	Type       PayloadType
	SSRC       uint16
	PayloadLen uint32
	Reserved   [4]byte // documented as zero, observed as 52 00 00 00
}

func (h Header) String() string {
	return fmt.Sprintf("type=%s ssrc=%d payload=%dB flags=0x%02x reserved=%x",
		h.Type, h.SSRC, h.PayloadLen, h.RawFlags, h.Reserved)
}

// Frame is one complete packet.
type Frame struct {
	Header     Header
	Payload    []byte // decompressed when the gzip signature was recognized
	Raw        []byte // exactly as it came off the wire
	Compressed bool   // detected by signature, not by bit M
}

// DecodeHeader reads the 12 fixed bytes. It does not reject by version; see the
// package comment.
func DecodeHeader(b []byte) (Header, error) {
	if len(b) < HeaderSize {
		return Header{}, fmt.Errorf("n9m: header needs %d bytes, got %d", HeaderSize, len(b))
	}
	h := Header{
		RawFlags:   b[0],
		Type:       PayloadType(b[1]),
		SSRC:       binary.BigEndian.Uint16(b[2:4]),
		PayloadLen: binary.BigEndian.Uint32(b[4:8]),
	}
	copy(h.Reserved[:], b[8:12])
	if h.PayloadLen > MaxPayloadSize {
		return h, fmt.Errorf("n9m: payload of %d bytes exceeds the %d limit, frame sync likely lost", h.PayloadLen, MaxPayloadSize)
	}
	return h, nil
}

// ReadFrame reads one complete packet. It returns io.EOF when the stream ends
// cleanly between frames.
func ReadFrame(r io.Reader) (*Frame, error) {
	raw := make([]byte, HeaderSize)
	if _, err := io.ReadFull(r, raw); err != nil {
		return nil, err
	}
	header, err := DecodeHeader(raw)
	if err != nil {
		return nil, err
	}

	frame := &Frame{Header: header}
	if header.PayloadLen > 0 {
		frame.Raw = make([]byte, header.PayloadLen)
		if _, err := io.ReadFull(r, frame.Raw); err != nil {
			return nil, fmt.Errorf("n9m: reading %d-byte payload: %w", header.PayloadLen, err)
		}
	}

	// Compression by gzip signature rather than by the bit: the bit sits at a
	// position we have not confirmed, the signature is a fact.
	frame.Payload = frame.Raw
	if bytes.HasPrefix(frame.Raw, gzipMagic) {
		if out, err := decompress(frame.Raw); err == nil {
			frame.Payload = out
			frame.Compressed = true
		}
	}
	return frame, nil
}

// WriteFrame serializes a frame using the same flags byte and RESERVE the
// device uses.
func WriteFrame(w io.Writer, t PayloadType, ssrc uint16, payload []byte) error {
	return WriteFrameWith(w, ObservedFlags, ObservedReserved, t, ssrc, payload)
}

// WriteFrameWith mirrors an exact header back, which is what the probe does
// when replying.
func WriteFrameWith(w io.Writer, flags byte, reserved [4]byte, t PayloadType, ssrc uint16, payload []byte) error {
	header := make([]byte, HeaderSize)
	header[0] = flags
	header[1] = byte(t)
	binary.BigEndian.PutUint16(header[2:4], ssrc)
	binary.BigEndian.PutUint32(header[4:8], uint32(len(payload)))
	copy(header[8:12], reserved[:])
	if _, err := w.Write(header); err != nil {
		return err
	}
	_, err := w.Write(payload)
	return err
}

func decompress(b []byte) ([]byte, error) {
	r, err := gzip.NewReader(bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	defer r.Close()
	return io.ReadAll(io.LimitReader(r, MaxPayloadSize))
}
