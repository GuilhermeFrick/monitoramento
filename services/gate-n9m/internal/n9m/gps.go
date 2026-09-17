package n9m

import (
	"encoding/binary"
	"fmt"
	"time"
)

// SSRC values for payload type 22, the special report channel of chapter 04.
// The header's SSRC picks which report this is.
const (
	SpecialHeartbeat    uint16 = 0
	SpecialHeartbeatAck uint16 = 1
	SpecialGPS          uint16 = 2
	SpecialMileage      uint16 = 3
	SpecialAirQuality   uint16 = 4
	SpecialDrivingPose  uint16 = 5
	SpecialBarcode      uint16 = 6
	SpecialFuel         uint16 = 7
	SpecialGDSLive      uint16 = 8
	SpecialGPSBodyCam   uint16 = 9
	SpecialCANBox       uint16 = 10
	SpecialGSensor      uint16 = 11
	SpecialGPSAck       uint16 = 12
	SpecialGDSStats     uint16 = 13
	SpecialACCKey       uint16 = 14
	SpecialRadarTarget  uint16 = 15
	SpecialSentinel     uint16 = 16
)

// gpsFixedSize is the size of the documented Net_GPS struct: three flag bytes
// plus one reserved, five 32-bit fields, and a 16-byte timestamp string.
const gpsFixedSize = 4 + 5*4 + 16

// GPSQuality is the viled field: how much the position can be trusted.
type GPSQuality uint8

const (
	// GPSValid means the satellite fix is good.
	GPSValid GPSQuality = 0
	// GPSUnreliable means too few satellites were tracked.
	GPSUnreliable GPSQuality = 1
	// GPSNoModule means the unit reports no GPS hardware at all. The bench
	// M1N2.0 reports this, so a position of 0,0 from it is an absent reading
	// rather than a point in the Gulf of Guinea.
	GPSNoModule GPSQuality = 2
)

func (q GPSQuality) String() string {
	switch q {
	case GPSValid:
		return "valid"
	case GPSUnreliable:
		return "unreliable"
	case GPSNoModule:
		return "no-gps-module"
	default:
		return fmt.Sprintf("unknown(%d)", uint8(q))
	}
}

// GPSReport is one position record, decoded from the Net_GPS struct.
type GPSReport struct {
	Quality GPSQuality

	// Historical marks a record the device held and is uploading now rather
	// than one produced just now. It is the ureal field, and it matters:
	// ingestion has to key off Time, not off arrival, or a week-old record
	// lands in the database stamped with today.
	Historical bool

	// Longitude and Latitude are in degrees, already signed. On the wire the
	// sign lives in the most significant bit and the magnitude is scaled by a
	// million; 1 means west and south.
	Longitude float64
	Latitude  float64

	SpeedKmh float64 // scaled by 100 on the wire
	Heading  float64 // degrees clockwise from north, scaled by 100
	Altitude int32   // meters relative to sea level

	// Time is the device's own clock, with its timezone already applied. It
	// has no zone attached here because the wire format carries none.
	Time time.Time

	// Extended holds the bytes after the fixed struct, when the uexpand flag
	// is set. Chapter 04 documents several layouts for this and the bench
	// device matches none of them, so it stays raw on purpose. See
	// docs/arquitetura/n9m-observado.md.
	Extended []byte
}

// Valid reports whether the position can be used. A report from a unit with no
// GPS module, or with too few satellites, carries zeros that must not be
// mistaken for a real coordinate.
func (g GPSReport) Valid() bool {
	return g.Quality == GPSValid
}

func (g GPSReport) String() string {
	when := "no timestamp"
	if !g.Time.IsZero() {
		when = g.Time.Format("2006-01-02 15:04:05")
	}
	origin := "live"
	if g.Historical {
		origin = "backlog"
	}
	if !g.Valid() {
		return fmt.Sprintf("%s %s no position (%s)", when, origin, g.Quality)
	}
	return fmt.Sprintf("%s %s %.6f,%.6f %.2fkm/h heading %.2f alt %dm",
		when, origin, g.Latitude, g.Longitude, g.SpeedKmh, g.Heading, g.Altitude)
}

// DecodeGPS decodes the Net_GPS payload of a special report whose SSRC is
// SpecialGPS.
//
// Everything past the flag bytes is little-endian, which is the opposite of the
// PAYLOAD LEN in the frame header and matches the SSRC field.
func DecodeGPS(payload []byte) (GPSReport, error) {
	var g GPSReport
	if len(payload) < gpsFixedSize {
		return g, fmt.Errorf("n9m: GPS report needs %d bytes, got %d", gpsFixedSize, len(payload))
	}

	g.Quality = GPSQuality(payload[0])
	expanded := payload[1] != 0
	g.Historical = payload[2] == 1
	// payload[3] is reserved

	g.Longitude = decodeCoordinate(binary.LittleEndian.Uint32(payload[4:8]))
	g.Latitude = decodeCoordinate(binary.LittleEndian.Uint32(payload[8:12]))
	g.SpeedKmh = float64(int32(binary.LittleEndian.Uint32(payload[12:16]))) / 100
	g.Heading = float64(int32(binary.LittleEndian.Uint32(payload[16:20]))) / 100
	g.Altitude = int32(binary.LittleEndian.Uint32(payload[20:24]))
	g.Time = decodeDeviceTime(payload[24:40])

	if expanded && len(payload) > gpsFixedSize {
		g.Extended = payload[gpsFixedSize:]
	}
	return g, nil
}

// decodeCoordinate turns the wire encoding into signed degrees. The top bit is
// the hemisphere — 1 means west or south — and the rest is degrees scaled by a
// million.
func decodeCoordinate(raw uint32) float64 {
	negative := raw&0x80000000 != 0
	degrees := float64(raw&0x7FFFFFFF) / 1e6
	if negative {
		return -degrees
	}
	return degrees
}

// deviceTimeLayout is the utime field: "20120928121212".
const deviceTimeLayout = "20060102150405"

// decodeDeviceTime parses the NUL-padded timestamp string. An unparseable or
// empty value becomes the zero Time rather than a wrong one — a bogus date that
// formats cleanly is worse than an obviously missing one.
func decodeDeviceTime(raw []byte) time.Time {
	end := len(raw)
	for i, b := range raw {
		if b == 0 {
			end = i
			break
		}
	}
	text := string(raw[:end])
	if len(text) < len(deviceTimeLayout) {
		return time.Time{}
	}
	t, err := time.Parse(deviceTimeLayout, text[:len(deviceTimeLayout)])
	if err != nil {
		return time.Time{}
	}
	return t
}
