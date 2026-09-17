package n9m

import (
	"encoding/json"
	"testing"
)

// Some payloads arrive with a NUL byte in front of the JSON — seen on a
// {"DATA":{"CALIINFO":...}} frame. encoding/json refuses that, so without the
// trim the whole message is lost silently.
func TestNulPrefixedJSONIsParsed(t *testing.T) {
	payload := append([]byte{0x00}, []byte(`{"MODULE":"DEVEMM","OPERATION":"SPI"}`)...)

	if !LooksLikeJSON(payload) {
		t.Fatal("a NUL-prefixed payload must still be recognized as JSON")
	}
	msg, _, err := ParseMessage(payload)
	if err != nil {
		t.Fatalf("parsing: %v", err)
	}
	if msg.Module != "DEVEMM" || msg.Operation != "SPI" {
		t.Errorf("got %+v", msg)
	}
}

func TestBinaryPayloadIsNotMistakenForJSON(t *testing.T) {
	// The GPS special report (payload type 22) starts like this.
	if LooksLikeJSON([]byte{0x02, 0x01, 0x01, 0x00, 0x00}) {
		t.Error("binary payload was taken for JSON")
	}
}

func TestEmptyPayloadIsNotJSON(t *testing.T) {
	if LooksLikeJSON(nil) {
		t.Error("an empty payload is not JSON")
	}
}

// The real CONNECT, with the fields that change what we do.
func TestDecodeConnectFromRealPayload(t *testing.T) {
	payload := []byte(`{"MODULE":"CERTIFICATE","OPERATION":"CONNECT",
	  "SESSION":"0000000B5E54AD399A8888A46AF8C521",
	  "PARAMETER":{"AUTOCAR":"","AUTONO":"0","CARNUM":"","CHANNEL":6,
	   "DEVNAME":"M1N2.0-STANDARD","DSNO":"00E400689E","ENCRYPTTYPE":0,
	   "ETLS":0,"EV":"V2.0","NET":1,"PV":1,"SC":0,"UNAME":"","UNO":""}}`)

	msg, _, err := ParseMessage(payload)
	if err != nil {
		t.Fatalf("parsing: %v", err)
	}
	params, err := DecodeConnect(msg)
	if err != nil {
		t.Fatalf("decoding CONNECT: %v", err)
	}

	if params.Serial != "00E400689E" {
		t.Errorf("serial = %q", params.Serial)
	}
	if params.EvidenceVersion != "V2.0" {
		t.Errorf("evidence version = %q — this decides whether evidence can go straight to storage", params.EvidenceVersion)
	}
	if params.Channels != 6 || params.Network != 1 || params.ServerSlot != 0 {
		t.Errorf("channels=%d network=%d slot=%d", params.Channels, params.Network, params.ServerSlot)
	}
	// The vehicle fields arrive empty on a real device. That is the point: the
	// vehicle link cannot come from the device.
	if params.Plate != "" || params.DriverID != "" {
		t.Errorf("expected empty vehicle fields, got plate=%q driver=%q", params.Plate, params.DriverID)
	}
}

func TestDecodeConnectWithoutParameterIsNotAnError(t *testing.T) {
	msg, _, err := ParseMessage([]byte(`{"MODULE":"CERTIFICATE","OPERATION":"KEEPALIVE"}`))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := DecodeConnect(msg); err != nil {
		t.Errorf("a message with no PARAMETER should decode to the zero value, got %v", err)
	}
}

func TestConnectAcceptedShape(t *testing.T) {
	var got map[string]any
	if err := json.Unmarshal(ConnectAccepted("SESSION-1", 1), &got); err != nil {
		t.Fatal(err)
	}
	if got["SESSION"] != "SESSION-1" {
		t.Errorf("the session must be echoed back, got %v", got["SESSION"])
	}
	response, ok := got["RESPONSE"].(map[string]any)
	if !ok {
		t.Fatalf("missing RESPONSE: %v", got)
	}
	if response["ERRORCODE"] != float64(0) || response["ERRORCAUSE"] != "SUCCESS" {
		t.Errorf("response = %v", response)
	}
}

func TestConnectRejectedCarriesTheCause(t *testing.T) {
	var got map[string]any
	if err := json.Unmarshal(ConnectRejected("S", 5, "NOT REGISTERED"), &got); err != nil {
		t.Fatal(err)
	}
	response := got["RESPONSE"].(map[string]any)
	if response["ERRORCODE"] != float64(5) || response["ERRORCAUSE"] != "NOT REGISTERED" {
		t.Errorf("response = %v", response)
	}
}

// Chapter 03 defines the heartbeat reply as the same JSON with no RESPONSE.
func TestKeepAliveEchoHasNoResponse(t *testing.T) {
	var got map[string]any
	if err := json.Unmarshal(KeepAliveEcho("SESSION-1"), &got); err != nil {
		t.Fatal(err)
	}
	if _, present := got["RESPONSE"]; present {
		t.Error("the keepalive echo must not carry a RESPONSE object")
	}
	if got["OPERATION"] != OpKeepAlive || got["SESSION"] != "SESSION-1" {
		t.Errorf("got %v", got)
	}
}
