package n9m

import (
	"bytes"
	"encoding/json"
)

// Modules and operations we act on. The device sends many more — DEVEMM alone
// carries GETSUPPORTSERVICE, DEVINFOCHANGEUPLOAD, UPDATEIOSTATUSINFO and SPI,
// none of which chapter 03 documents. We name only what we answer.
const (
	ModuleCertificate = "CERTIFICATE"

	OpConnect   = "CONNECT"
	OpKeepAlive = "KEEPALIVE"
)

// Message is the JSON envelope from chapter 02. PARAMETER and RESPONSE stay raw
// because their shape depends on the operation, and guessing a struct for every
// one of them would break the moment the device sends a field we did not model.
type Message struct {
	Module    string          `json:"MODULE"`
	Operation string          `json:"OPERATION"`
	Session   string          `json:"SESSION"`
	Parameter json.RawMessage `json:"PARAMETER,omitempty"`
	Response  json.RawMessage `json:"RESPONSE,omitempty"`
}

// jsonTrimSet includes NUL because some payloads arrive with a zero byte in
// front of the JSON — seen on {"DATA":{"CALIINFO":...}}. encoding/json rejects
// that, so whoever does not trim it here loses the whole message.
const jsonTrimSet = "\x00 \t\r\n"

// TrimPayload strips the padding that surrounds JSON payloads on the wire.
func TrimPayload(payload []byte) []byte {
	return bytes.Trim(payload, jsonTrimSet)
}

// LooksLikeJSON reports whether a payload can be parsed as a JSON object.
//
// The header type does not decide this. Payload type 30, which the spec calls
// "streamax maintain data, not opensourced currently", arrives as plain JSON
// and made up 85% of the traffic in the first session. So the first byte of the
// payload decides, not the table.
func LooksLikeJSON(payload []byte) bool {
	return bytes.HasPrefix(TrimPayload(payload), []byte("{"))
}

// ParseMessage decodes a payload into the command envelope. The second return
// value is the trimmed payload, useful for logging exactly what was parsed.
func ParseMessage(payload []byte) (Message, []byte, error) {
	body := TrimPayload(payload)
	var m Message
	err := json.Unmarshal(body, &m)
	return m, body, err
}

// ConnectAccepted builds the successful CONNECT reply of chapter 03.
//
// MASKCMD is a bitmask of which history streams the server is willing to
// receive; bit 0 is alarms. It matters more than it looks: the device replays
// stored records on connect, so this is where we say how much of that backlog
// we want.
func ConnectAccepted(session string, maskCmd int) []byte {
	return mustMarshal(map[string]any{
		"MODULE":    ModuleCertificate,
		"OPERATION": OpConnect,
		"SESSION":   session,
		"RESPONSE": map[string]any{
			"ERRORCODE":  0,
			"ERRORCAUSE": "SUCCESS",
			"MASKCMD":    maskCmd,
		},
	})
}

// ConnectRejected builds the failure reply. Chapter 03 requires the server to
// refuse and disconnect a device that is not in its database — returning an
// error here is the protocol working as designed, not a fault.
func ConnectRejected(session string, code int, cause string) []byte {
	return mustMarshal(map[string]any{
		"MODULE":    ModuleCertificate,
		"OPERATION": OpConnect,
		"SESSION":   session,
		"RESPONSE": map[string]any{
			"ERRORCODE":  code,
			"ERRORCAUSE": cause,
		},
	})
}

// KeepAliveEcho builds the heartbeat reply, which chapter 03 defines as the
// same JSON sent back with no RESPONSE object.
func KeepAliveEcho(session string) []byte {
	return mustMarshal(map[string]any{
		"MODULE":    ModuleCertificate,
		"OPERATION": OpKeepAlive,
		"SESSION":   session,
	})
}

// ConnectParams are the CONNECT fields we actually read. The device sends about
// thirty; these are the ones that change what we do.
type ConnectParams struct {
	// Serial is the chip serial number and the device's identity. It is the
	// only field on the device's registration screen that cannot be typed.
	Serial string `json:"DSNO"`

	// Plate and the vehicle fields below are typed by whoever installed the
	// unit, and arrive empty on a fresh device. They are a declaration to
	// reconcile against our own records, never the vehicle link itself.
	Plate       string `json:"CARNUM"`
	VehicleID   string `json:"AUTOCAR"`
	DriverID    string `json:"UNO"`
	DriverName  string `json:"UNAME"`
	DeviceName  string `json:"DEVNAME"`
	CompanyName string `json:"CPN"`

	// EvidenceVersion is "V1.0" (device pushes), "V1.1" (platform requests) or
	// "V2.0" (platform requests plus HTTP upload). V2.0 is the one that lets
	// evidence go straight to object storage without passing through us.
	EvidenceVersion string `json:"EV"`

	// Network is 0 wired, 1 WiFi, 2 3G/4G. Worth checking before starting any
	// task that burns mobile data.
	Network int `json:"NET"`

	// ServerSlot says which of the device's configured servers this connection
	// is for, counting from zero.
	ServerSlot int `json:"SC"`

	Channels        int `json:"CHANNEL"`
	PlatformVersion int `json:"PV"`
	EncryptType     int `json:"ENCRYPTTYPE"`
	TLS             int `json:"ETLS"`
}

// DecodeConnect reads the CONNECT parameters out of a parsed message.
func DecodeConnect(m Message) (ConnectParams, error) {
	var p ConnectParams
	if len(m.Parameter) == 0 {
		return p, nil
	}
	err := json.Unmarshal(m.Parameter, &p)
	return p, err
}

func mustMarshal(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		// The inputs are maps of strings and ints built right here, so a
		// failure would mean the runtime is broken, not the data.
		panic("n9m: marshaling a fixed reply: " + err.Error())
	}
	return b
}
