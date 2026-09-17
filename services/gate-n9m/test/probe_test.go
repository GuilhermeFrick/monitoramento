package test

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"avansat/gate-n9m/internal/n9m"
	"avansat/gate-n9m/internal/probe"
)

// The real device's CONNECT, trimmed to the fields that matter.
const realConnect = `{"MODULE":"CERTIFICATE","OPERATION":"CONNECT",` +
	`"SESSION":"0000000B5E54AD399A8888A46AF8C521",` +
	`"PARAMETER":{"DSNO":"00E400689E","DEVNAME":"M1N2.0-STANDARD","EV":"V2.0","CHANNEL":6,"SC":0}}`

// start brings up a probe on a free port and returns its address plus whatever
// it logged, once the returned cleanup has run.
func start(t *testing.T, cfg probe.Config) (addr string, logged func() string) {
	t.Helper()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr = listener.Addr().String()
	listener.Close() // free it again; the probe reopens the same port

	var mu sync.Mutex
	var sink strings.Builder
	logger := log.New(&lockedWriter{mu: &mu, w: &sink}, "", 0)

	cfg.Addr = addr
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		if err := probe.New(cfg, logger).ListenAndServe(ctx); err != nil {
			logger.Printf("serve error: %v", err)
		}
	}()

	waitForListener(t, addr)
	t.Cleanup(func() {
		cancel()
		<-done
	})

	return addr, func() string {
		mu.Lock()
		defer mu.Unlock()
		return sink.String()
	}
}

type lockedWriter struct {
	mu *sync.Mutex
	w  io.Writer
}

func (l *lockedWriter) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.w.Write(p)
}

func waitForListener(t *testing.T, addr string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if c, err := net.Dial("tcp", addr); err == nil {
			c.Close()
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("probe did not come up on %s", addr)
}

func TestConnectIsAcceptedAndSessionEchoed(t *testing.T) {
	addr, _ := start(t, probe.Config{Reply: true, MaskCmd: 1})

	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	if err := n9m.WriteFrame(conn, n9m.PayloadCommand, 0, []byte(realConnect)); err != nil {
		t.Fatal(err)
	}

	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	frame, err := n9m.ReadFrame(conn)
	if err != nil {
		t.Fatalf("no reply to CONNECT: %v", err)
	}

	var reply map[string]any
	if err := json.Unmarshal(frame.Payload, &reply); err != nil {
		t.Fatalf("reply is not JSON: %v", err)
	}
	if reply["SESSION"] != "0000000B5E54AD399A8888A46AF8C521" {
		t.Errorf("session was not echoed: %v", reply["SESSION"])
	}
	response := reply["RESPONSE"].(map[string]any)
	if response["ERRORCODE"] != float64(0) {
		t.Errorf("errorcode = %v, want 0", response["ERRORCODE"])
	}
}

// The reply has to carry the device's own flags byte and RESERVE back, not the
// values from the spec table.
func TestReplyMirrorsTheDeviceHeader(t *testing.T) {
	addr, _ := start(t, probe.Config{Reply: true})

	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	odd := [4]byte{0x52, 0x11, 0x22, 0x33}
	if err := n9m.WriteFrameWith(conn, 0x08, odd, n9m.PayloadCommand, 0, []byte(realConnect)); err != nil {
		t.Fatal(err)
	}

	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	frame, err := n9m.ReadFrame(conn)
	if err != nil {
		t.Fatal(err)
	}
	if frame.Header.RawFlags != 0x08 {
		t.Errorf("flags = 0x%02x, want the 0x08 that arrived", frame.Header.RawFlags)
	}
	if frame.Header.Reserved != odd {
		t.Errorf("reserved = %x, want the %x that arrived", frame.Header.Reserved, odd)
	}
}

func TestKeepAliveIsEchoed(t *testing.T) {
	addr, _ := start(t, probe.Config{Reply: true})

	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	body := []byte(`{"MODULE":"CERTIFICATE","OPERATION":"KEEPALIVE","SESSION":"S1"}`)
	if err := n9m.WriteFrame(conn, n9m.PayloadCommand, 0, body); err != nil {
		t.Fatal(err)
	}

	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	frame, err := n9m.ReadFrame(conn)
	if err != nil {
		t.Fatalf("no reply to KEEPALIVE: %v", err)
	}
	var reply map[string]any
	if err := json.Unmarshal(frame.Payload, &reply); err != nil {
		t.Fatal(err)
	}
	if reply["OPERATION"] != "KEEPALIVE" || reply["SESSION"] != "S1" {
		t.Errorf("reply = %v", reply)
	}
	if _, present := reply["RESPONSE"]; present {
		t.Error("the keepalive echo must not carry RESPONSE")
	}
}

// Without -reply the probe stays silent on purpose: it observes the CONNECT and
// the device's retry behavior without making it act.
func TestSilentModeAnswersNothing(t *testing.T) {
	addr, logged := start(t, probe.Config{Reply: false})

	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	if err := n9m.WriteFrame(conn, n9m.PayloadCommand, 0, []byte(realConnect)); err != nil {
		t.Fatal(err)
	}

	conn.SetReadDeadline(time.Now().Add(300 * time.Millisecond))
	if _, err := n9m.ReadFrame(conn); err == nil {
		t.Fatal("the silent probe replied, it must not")
	}
	if !strings.Contains(logged(), "00E400689E") {
		t.Error("silent does not mean blind: the CONNECT should still be logged")
	}
}

// A payload the framing cannot make sense of must not take the whole session
// down quietly — the leftover bytes are the most valuable thing the probe
// produces, so they have to reach the log.
func TestBrokenFramingDumpsWhatIsLeft(t *testing.T) {
	addr, logged := start(t, probe.Config{Reply: true})

	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	// A header promising far more than MaxPayloadSize.
	conn.Write([]byte{0x08, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0x52, 0, 0, 0})
	conn.Write([]byte("leftover bytes to dump"))

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if strings.Contains(logged(), "ERROR") {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("no framing error was logged; log was:\n%s", logged())
}

// Binary payloads (the GPS special report) must be reported by size, not fed to
// the JSON parser.
func TestBinaryPayloadIsReportedNotParsed(t *testing.T) {
	addr, logged := start(t, probe.Config{Reply: true})

	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	gps := make([]byte, 261)
	copy(gps, []byte{0x02, 0x01, 0x01})
	if err := n9m.WriteFrame(conn, n9m.PayloadSpecial, 512, gps); err != nil {
		t.Fatal(err)
	}

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if strings.Contains(logged(), "261 binary bytes") {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("binary payload was not reported; log was:\n%s", logged())
}

// Raw captures are the fallback when decoding is wrong, so they have to hold
// the bytes exactly as they arrived, header included.
func TestCaptureKeepsRawBytes(t *testing.T) {
	dir := t.TempDir()
	addr, _ := start(t, probe.Config{Reply: true, CaptureDir: dir})

	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	if err := n9m.WriteFrame(conn, n9m.PayloadCommand, 0, []byte(realConnect)); err != nil {
		t.Fatal(err)
	}
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	if _, err := n9m.ReadFrame(conn); err != nil {
		t.Fatal(err)
	}
	conn.Close()

	// The probe writes one file per connection, and the readiness check that
	// started this probe counts as one — so look for the file holding our
	// payload rather than assuming there is exactly one.
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		files, _ := filepath.Glob(filepath.Join(dir, "*.bin"))
		for _, name := range files {
			data, err := os.ReadFile(name)
			if err != nil || !strings.Contains(string(data), "00E400689E") {
				continue
			}
			if len(data) != n9m.HeaderSize+len(realConnect) {
				t.Errorf("capture has %d bytes, want %d — raw means raw, header included",
					len(data), n9m.HeaderSize+len(realConnect))
			}
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("no capture file held the payload")
}

func TestLocalAddressesSkipsLoopback(t *testing.T) {
	for _, addr := range probe.LocalAddresses() {
		if strings.HasPrefix(addr, "127.") {
			t.Errorf("loopback %s should not be offered as a device target", addr)
		}
	}
}
