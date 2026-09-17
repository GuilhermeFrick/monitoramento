package test

import (
	"bytes"
	"compress/gzip"
	"encoding/binary"
	"io"
	"testing"

	"avansat/gate-n9m/internal/n9m"
)

// realHeader is the 12 bytes an M1N2.0-STANDARD running protocol 1.0.6 sent on
// CONNECT, captured by the probe on 2026-09-17. It declared a 446-byte payload
// and the capture was 458 bytes — 12 + 446 adds up exactly, which is what
// proves the header is 12 bytes.
//
// This is the test that matters. The others check the code; this one checks
// that the code agrees with the device, which is the only authority here.
var realHeader = []byte{
	0x08,       // byte 0 — the table says this should be 0x4X for V=1
	0x00,       // PAYLOAD TYPE = 0, command
	0x00, 0x00, //             SSRC = 0
	0x00, 0x00, 0x01, 0xbe, // PAYLOAD LEN = 446
	0x52, 0x00, 0x00, 0x00, // RESERVE — documented as zero, is not
}

func TestDecodeRealDeviceHeader(t *testing.T) {
	h, err := n9m.DecodeHeader(realHeader)
	if err != nil {
		t.Fatalf("the real device's header must be accepted, got error: %v", err)
	}
	if h.Type != n9m.PayloadCommand {
		t.Errorf("type = %v, want command", h.Type)
	}
	if h.SSRC != 0 {
		t.Errorf("ssrc = %d, want 0", h.SSRC)
	}
	if h.PayloadLen != 446 {
		t.Errorf("payload length = %d, want 446", h.PayloadLen)
	}
	if h.RawFlags != 0x08 {
		t.Errorf("RawFlags = 0x%02x, want 0x08 — the byte must be kept as it arrived", h.RawFlags)
	}
	if h.Reserved != [4]byte{0x52, 0, 0, 0} {
		t.Errorf("reserved = %x, want 52000000", h.Reserved)
	}
}

// The version check that used to live here rejected every connection from the
// real device. This test exists so nobody reintroduces it by accident.
func TestRealHeaderIsNotRejectedByVersion(t *testing.T) {
	body := []byte(`{"MODULE":"CERTIFICATE","OPERATION":"CONNECT"}`)

	frame, err := n9m.ReadFrame(frameWithRealHeader(body))
	if err != nil {
		t.Fatalf("a frame from the real device was rejected: %v", err)
	}
	if !bytes.Equal(frame.Payload, body) {
		t.Errorf("payload = %q", frame.Payload)
	}
}

func TestPayloadLengthIsBigEndian(t *testing.T) {
	// 0x000001be read little-endian would be 3187736576, not 446.
	h, err := n9m.DecodeHeader(realHeader)
	if err != nil {
		t.Fatal(err)
	}
	if h.PayloadLen != 446 {
		t.Fatalf("payload length = %d — byte order is likely swapped", h.PayloadLen)
	}
}

func TestOversizedPayloadIsRejected(t *testing.T) {
	header := append([]byte(nil), realHeader...)
	binary.BigEndian.PutUint32(header[4:8], n9m.MaxPayloadSize+1)
	if _, err := n9m.DecodeHeader(header); err == nil {
		t.Fatal("want error: with the version check gone, the size limit is the only guard against lost frame sync")
	}
}

func TestShortHeaderIsRejected(t *testing.T) {
	if _, err := n9m.DecodeHeader([]byte{0x08, 0x00}); err == nil {
		t.Fatal("want error for an incomplete header")
	}
}

func TestTruncatedPayloadIsRejected(t *testing.T) {
	var buf bytes.Buffer
	header := append([]byte(nil), realHeader...)
	binary.BigEndian.PutUint32(header[4:8], 100) // promises 100
	buf.Write(header)
	buf.WriteString("but sends only this")

	if _, err := n9m.ReadFrame(&buf); err == nil {
		t.Fatal("want error for a truncated payload")
	}
}

func TestRoundTrip(t *testing.T) {
	body := []byte(`{"MODULE":"CERTIFICATE","OPERATION":"KEEPALIVE"}`)

	var buf bytes.Buffer
	if err := n9m.WriteFrame(&buf, n9m.PayloadCommand, 0, body); err != nil {
		t.Fatalf("writing: %v", err)
	}
	frame, err := n9m.ReadFrame(&buf)
	if err != nil {
		t.Fatalf("reading: %v", err)
	}
	if !bytes.Equal(frame.Payload, body) {
		t.Errorf("payload = %q, want %q", frame.Payload, body)
	}
}

// What we write must go out in the device's dialect, not the table's.
func TestWriteUsesTheDeviceDialect(t *testing.T) {
	var buf bytes.Buffer
	if err := n9m.WriteFrame(&buf, n9m.PayloadCommand, 0, []byte("x")); err != nil {
		t.Fatal(err)
	}
	out := buf.Bytes()
	if out[0] != 0x08 {
		t.Errorf("byte 0 = 0x%02x, want 0x08 (what the device sends)", out[0])
	}
	if !bytes.Equal(out[8:12], []byte{0x52, 0, 0, 0}) {
		t.Errorf("reserved = %x, want 52000000", out[8:12])
	}
}

func TestWriteFrameWithMirrorsTheHeader(t *testing.T) {
	var buf bytes.Buffer
	reserved := [4]byte{0xAA, 0xBB, 0xCC, 0xDD}
	if err := n9m.WriteFrameWith(&buf, 0x99, reserved, n9m.PayloadSpecial, 7, []byte("x")); err != nil {
		t.Fatal(err)
	}
	out := buf.Bytes()
	if out[0] != 0x99 || out[1] != byte(n9m.PayloadSpecial) {
		t.Errorf("flags/type = %02x %02x", out[0], out[1])
	}
	if binary.LittleEndian.Uint16(out[2:4]) != 7 {
		t.Errorf("ssrc = %d", binary.LittleEndian.Uint16(out[2:4]))
	}
	if !bytes.Equal(out[8:12], reserved[:]) {
		t.Errorf("reserved was not mirrored: %x", out[8:12])
	}
}

func TestTwoFramesInSequence(t *testing.T) {
	var buf bytes.Buffer
	if err := n9m.WriteFrame(&buf, n9m.PayloadCommand, 0, []byte("first")); err != nil {
		t.Fatal(err)
	}
	if err := n9m.WriteFrame(&buf, n9m.PayloadSpecial, 7, []byte("second")); err != nil {
		t.Fatal(err)
	}

	one, err := n9m.ReadFrame(&buf)
	if err != nil || string(one.Payload) != "first" {
		t.Fatalf("first frame: %q, %v", one.Payload, err)
	}
	two, err := n9m.ReadFrame(&buf)
	if err != nil || string(two.Payload) != "second" || two.Header.SSRC != 7 {
		t.Fatalf("second frame: %q ssrc=%d, %v", two.Payload, two.Header.SSRC, err)
	}
	if _, err := n9m.ReadFrame(&buf); err != io.EOF {
		t.Errorf("want clean EOF at the end, got %v", err)
	}
}

// Compression is detected by the gzip signature, not by bit M, whose position
// we cannot confirm. Here the flags byte is the usual 0x08 with no compression
// bit set anywhere, and it still has to decompress.
func TestCompressionIsDetectedBySignature(t *testing.T) {
	body := []byte(`{"MODULE":"CERTIFICATE","OPERATION":"CONNECT","PARAMETER":{"DSNO":"00E400689E"}}`)

	var zipped bytes.Buffer
	w := gzip.NewWriter(&zipped)
	if _, err := w.Write(body); err != nil {
		t.Fatal(err)
	}
	w.Close()

	frame, err := n9m.ReadFrame(frameWithRealHeader(zipped.Bytes()))
	if err != nil {
		t.Fatalf("reading: %v", err)
	}
	if !frame.Compressed {
		t.Error("should have recognized the gzip payload")
	}
	if !bytes.Equal(frame.Payload, body) {
		t.Errorf("payload was not decompressed: %q", frame.Payload)
	}
	if !bytes.Equal(frame.Raw, zipped.Bytes()) {
		t.Error("Raw should keep the bytes as they came off the wire")
	}
}

// A payload that starts like gzip but is not must pass through untouched.
func TestNonGzipPayloadIsUntouched(t *testing.T) {
	body := []byte{0x1f, 0x00, 0x03, 0xff}

	frame, err := n9m.ReadFrame(frameWithRealHeader(body))
	if err != nil {
		t.Fatal(err)
	}
	if frame.Compressed {
		t.Error("should not have marked this as compressed")
	}
	if !bytes.Equal(frame.Payload, body) {
		t.Errorf("payload altered: %x", frame.Payload)
	}
}

func TestPayloadTypeNames(t *testing.T) {
	if got := n9m.PayloadMaintenance.String(); got != "maintenance" {
		t.Errorf("type 30 = %q", got)
	}
	if got := n9m.PayloadType(99).String(); got != "unknown(99)" {
		t.Errorf("unknown type = %q", got)
	}
}

// frameWithRealHeader wraps a body in the header the real device sends, with
// the length fixed up.
func frameWithRealHeader(body []byte) io.Reader {
	var buf bytes.Buffer
	header := append([]byte(nil), realHeader...)
	binary.BigEndian.PutUint32(header[4:8], uint32(len(body)))
	buf.Write(header)
	buf.Write(body)
	return &buf
}
