package test

import (
	"bytes"
	"encoding/binary"
	"encoding/hex"
	"testing"

	"avansat/gate-n9m/internal/n9m"
)

// realGPS is the first 40 bytes of a payload-type-22 frame captured from the
// bench M1N2.0 on 2026-09-17. The frame carried 261 bytes; the rest is the
// extended block.
//
//	02          viled   = 2, no GPS module
//	01          uexpand = 1, extended data follows
//	01          ureal   = 1, this is a backlog record
//	00          reserved
//	00000000 ×5 longitude, latitude, speed, heading, altitude
//	"20260917172258" + 00 00
const realGPSHex = "02010100" +
	"0000000000000000000000000000000000000000" +
	"3230323630393137313732323538" + "0000"

func realGPSPayload(t *testing.T) []byte {
	t.Helper()
	b, err := hex.DecodeString(realGPSHex)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestDecodeRealGPSReport(t *testing.T) {
	report, err := n9m.DecodeGPS(realGPSPayload(t))
	if err != nil {
		t.Fatalf("decoding: %v", err)
	}

	if report.Quality != n9m.GPSNoModule {
		t.Errorf("quality = %v, want no-gps-module", report.Quality)
	}
	// This is the point of the Valid guard: a unit with no GPS reports 0,0,
	// and 0,0 is a real place in the Gulf of Guinea.
	if report.Valid() {
		t.Error("a report from a unit with no GPS module must not count as valid")
	}
	if !report.Historical {
		t.Error("ureal = 1 means this record was held and uploaded later")
	}
	if got := report.Time.Format("2006-01-02 15:04:05"); got != "2026-09-17 17:22:58" {
		t.Errorf("time = %s", got)
	}
}

// The header says GPS by SSRC, and SSRC is little-endian: bytes 02 00 mean 2,
// not 512. Read big-endian it would name no report in the chapter 04 table.
func TestGPSFrameIsIdentifiedBySSRC(t *testing.T) {
	body := realGPSPayload(t)

	header := append([]byte(nil), realHeader...)
	header[1] = byte(n9m.PayloadSpecial)
	binary.LittleEndian.PutUint16(header[2:4], n9m.SpecialGPS)
	binary.BigEndian.PutUint32(header[4:8], uint32(len(body)))

	if header[2] != 0x02 || header[3] != 0x00 {
		t.Fatalf("SSRC bytes = %x, want 0200 as seen on the wire", header[2:4])
	}

	frame, err := n9m.ReadFrame(bytes.NewReader(append(header, body...)))
	if err != nil {
		t.Fatal(err)
	}
	if frame.Header.SSRC != n9m.SpecialGPS {
		t.Errorf("ssrc = %d, want %d", frame.Header.SSRC, n9m.SpecialGPS)
	}
	if n9m.LooksLikeJSON(frame.Payload) {
		t.Error("a GPS payload must not be taken for JSON")
	}
}

// A real fix, built by hand from the encoding the spec describes: sign in the
// top bit, magnitude scaled by a million.
func TestDecodeSignedCoordinates(t *testing.T) {
	// Porto Alegre, roughly: 30.0346 S, 51.2177 W.
	payload := make([]byte, 40)
	payload[0] = byte(n9m.GPSValid)
	binary.LittleEndian.PutUint32(payload[4:8], 51217700|0x80000000)  // west
	binary.LittleEndian.PutUint32(payload[8:12], 30034600|0x80000000) // south
	binary.LittleEndian.PutUint32(payload[12:16], 6050)               // 60.50 km/h
	binary.LittleEndian.PutUint32(payload[16:20], 18090)              // 180.90 degrees
	binary.LittleEndian.PutUint32(payload[20:24], 12)                 // 12 m
	copy(payload[24:40], "20260917172258")

	report, err := n9m.DecodeGPS(payload)
	if err != nil {
		t.Fatal(err)
	}
	if !report.Valid() {
		t.Error("viled = 0 means the fix is good")
	}
	if report.Historical {
		t.Error("ureal = 0 means this is live, not backlog")
	}
	near := func(got, want float64) bool { return got-want < 1e-6 && want-got < 1e-6 }
	if !near(report.Longitude, -51.2177) {
		t.Errorf("longitude = %f, want -51.2177 — the top bit means west", report.Longitude)
	}
	if !near(report.Latitude, -30.0346) {
		t.Errorf("latitude = %f, want -30.0346 — the top bit means south", report.Latitude)
	}
	if !near(report.SpeedKmh, 60.50) {
		t.Errorf("speed = %f, want 60.50", report.SpeedKmh)
	}
	if !near(report.Heading, 180.90) {
		t.Errorf("heading = %f, want 180.90", report.Heading)
	}
	if report.Altitude != 12 {
		t.Errorf("altitude = %d, want 12", report.Altitude)
	}
}

func TestExtendedBlockIsKeptRaw(t *testing.T) {
	payload := append(realGPSPayload(t), []byte{0xDE, 0xAD, 0xBE, 0xEF}...)

	report, err := n9m.DecodeGPS(payload)
	if err != nil {
		t.Fatal(err)
	}
	if string(report.Extended) != "\xde\xad\xbe\xef" {
		t.Errorf("extended = %x — the block stays raw until its layout is settled", report.Extended)
	}
}

// A garbled timestamp must become the zero Time, never a plausible wrong date.
// A date that formats cleanly and is wrong is worse than one that is obviously
// missing.
func TestBadTimestampBecomesZeroTime(t *testing.T) {
	for _, raw := range []string{"not-a-date-xx", "00000000000000", ""} {
		payload := make([]byte, 40)
		copy(payload[24:40], raw)
		report, err := n9m.DecodeGPS(payload)
		if err != nil {
			t.Fatal(err)
		}
		if !report.Time.IsZero() {
			t.Errorf("timestamp %q decoded to %v, want the zero time", raw, report.Time)
		}
	}
}

func TestShortGPSPayloadIsRejected(t *testing.T) {
	if _, err := n9m.DecodeGPS(make([]byte, 20)); err == nil {
		t.Fatal("want an error for a payload shorter than the fixed struct")
	}
}
