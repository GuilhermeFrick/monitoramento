// Package probe listens for N9M devices and reports what they send.
//
// This is not the gate. It is the instrument that trades documentation for
// measurement before the gate gets written: point a device at it and watch what
// actually arrives on the wire.
//
// It answers exactly two things, CONNECT and KEEPALIVE, and only when Reply is
// set. Everything else is recorded and left unanswered on purpose — a probe
// that says yes to every command makes the device act, and then it has stopped
// being a probe.
//
// It also accepts any serial, which is the opposite of what the gate must do:
// chapter 03 requires refusing a device that is not in the database. That is
// why this only belongs on a bench, never on a public address.
package probe

import (
	"bufio"
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"time"

	"avansat/gate-n9m/internal/n9m"
)

// Config holds everything the probe needs to run.
type Config struct {
	// Addr is the listen address, e.g. ":7001".
	Addr string

	// CaptureDir, when set, receives the raw bytes of every connection, one
	// file each. Raw captures survive a framing bug that loses the decode, so
	// disagreements with the spec stay on disk instead of in memory.
	CaptureDir string

	// Reply turns on answering CONNECT and KEEPALIVE. Without it the device
	// gives up after 5s and reconnects, which already reveals the CONNECT and
	// the retry behavior. With it the session holds and telemetry starts.
	Reply bool

	// MaskCmd goes in the CONNECT reply and tells the device which history
	// streams we accept. Bit 0 is alarms.
	MaskCmd int
}

// Probe is a listening N9M endpoint.
type Probe struct {
	cfg     Config
	logger  *log.Logger
	counter atomic.Uint64
}

// New builds a probe. A nil logger writes to stderr without timestamps, since
// the probe stamps its own relative times.
func New(cfg Config, logger *log.Logger) *Probe {
	if logger == nil {
		logger = log.New(os.Stderr, "", 0)
	}
	if cfg.Addr == "" {
		cfg.Addr = ":7001"
	}
	return &Probe{cfg: cfg, logger: logger}
}

// ListenAndServe accepts connections until the context is cancelled.
func (p *Probe) ListenAndServe(ctx context.Context) error {
	if p.cfg.CaptureDir != "" {
		if err := os.MkdirAll(p.cfg.CaptureDir, 0o755); err != nil {
			return fmt.Errorf("creating capture dir %s: %w", p.cfg.CaptureDir, err)
		}
	}

	listener, err := net.Listen("tcp", p.cfg.Addr)
	if err != nil {
		return fmt.Errorf("listening on %s: %w", p.cfg.Addr, err)
	}
	defer listener.Close()

	mode := "silent (answers nothing)"
	if p.cfg.Reply {
		mode = "answering CONNECT and KEEPALIVE"
	}
	p.logger.Printf("n9m probe listening on %s — %s", p.cfg.Addr, mode)
	for _, addr := range LocalAddresses() {
		p.logger.Printf("  point the device at  %s%s", addr, p.cfg.Addr)
	}

	// Closing the listener is what unblocks Accept; there is no other way to
	// interrupt it.
	go func() {
		<-ctx.Done()
		listener.Close()
	}()

	for {
		conn, err := listener.Accept()
		if err != nil {
			if ctx.Err() != nil {
				p.logger.Printf("shutting down")
				return nil
			}
			p.logger.Printf("accept failed: %v", err)
			continue
		}
		go p.serve(conn)
	}
}

// session carries the per-connection state and its relative-time logger.
type session struct {
	probe *Probe
	conn  net.Conn
	id    uint64
	start time.Time
}

func (s *session) logf(format string, args ...any) {
	s.probe.logger.Printf("[%03d %8.3fs] %s", s.id, time.Since(s.start).Seconds(), fmt.Sprintf(format, args...))
}

func (p *Probe) serve(conn net.Conn) {
	defer conn.Close()

	s := &session{probe: p, conn: conn, id: p.counter.Add(1), start: time.Now()}
	s.logf("connected from %s", conn.RemoteAddr())

	source := io.Reader(conn)
	if p.cfg.CaptureDir != "" {
		if file, err := s.openCapture(); err != nil {
			s.logf("could not open capture file: %v", err)
		} else {
			defer file.Close()
			source = io.TeeReader(conn, file)
		}
	}

	reader := bufio.NewReaderSize(source, 64<<10)
	frames := 0

	for {
		frame, err := n9m.ReadFrame(reader)
		if err != nil {
			switch {
			case errors.Is(err, io.EOF):
				s.logf("device closed the connection after %d frames", frames)
			default:
				s.logf("ERROR %v (after %d frames) — first bytes of what is left:", err, frames)
				s.dumpRemaining(reader)
			}
			return
		}
		frames++
		s.logf("<- %s", frame.Header)
		if frame.Compressed {
			s.logf("    gzip: %dB on the wire, %dB decompressed", len(frame.Raw), len(frame.Payload))
		}
		s.handle(frame)
	}
}

func (s *session) openCapture() (*os.File, error) {
	name := filepath.Join(s.probe.cfg.CaptureDir,
		fmt.Sprintf("%s-%03d.bin", s.start.Format("20060102-150405"), s.id))
	file, err := os.Create(name)
	if err != nil {
		return nil, err
	}
	s.logf("raw bytes going to %s", name)
	return file, nil
}

func (s *session) handle(frame *n9m.Frame) {
	if !n9m.LooksLikeJSON(frame.Payload) {
		if n := len(frame.Payload); n > 0 {
			s.logf("    %d binary bytes, starting with %s", n, hex.EncodeToString(frame.Payload[:min(16, n)]))
		}
		return
	}

	msg, body, err := n9m.ParseMessage(frame.Payload)
	s.logf("    %s", body)
	if err != nil {
		s.logf("    (not valid JSON: %v)", err)
		return
	}

	if !s.probe.cfg.Reply || msg.Module != n9m.ModuleCertificate {
		return
	}

	switch msg.Operation {
	case n9m.OpConnect:
		if params, err := n9m.DecodeConnect(msg); err == nil && params.Serial != "" {
			s.logf("    device %s, %s, evidence %s, %d channels, slot %d",
				params.Serial, params.DeviceName, params.EvidenceVersion, params.Channels, params.ServerSlot)
		}
		s.reply(frame.Header, n9m.ConnectAccepted(msg.Session, s.probe.cfg.MaskCmd))
	case n9m.OpKeepAlive:
		s.reply(frame.Header, n9m.KeepAliveEcho(msg.Session))
	}
}

// reply mirrors back the flags byte and RESERVE that arrived, instead of the
// values from the spec table. The device decides whether it accepts a reply, so
// speaking its dialect beats insisting on the documentation.
func (s *session) reply(received n9m.Header, body []byte) {
	err := n9m.WriteFrameWith(s.conn, received.RawFlags, received.Reserved, n9m.PayloadCommand, 0, body)
	if err != nil {
		s.logf("    -> reply failed: %v", err)
		return
	}
	s.logf("    -> %s", body)
}

// dumpRemaining shows what was left in the buffer when framing broke. It is the
// most valuable output the probe produces, because it is exactly where the
// documentation and the wire disagree.
func (s *session) dumpRemaining(r io.Reader) {
	buf := make([]byte, 256)
	n, _ := io.ReadFull(io.LimitReader(r, int64(len(buf))), buf)
	if n <= 0 {
		s.logf("    (buffer empty)")
		return
	}
	for _, line := range strings.Split(strings.TrimRight(hex.Dump(buf[:n]), "\n"), "\n") {
		s.logf("    %s", line)
	}
}

// LocalAddresses lists the IPv4 addresses a device on the same network could
// reach, so the operator does not have to go look them up.
func LocalAddresses() []string {
	var out []string
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return out
	}
	for _, a := range addrs {
		ipnet, ok := a.(*net.IPNet)
		if !ok || ipnet.IP.IsLoopback() || ipnet.IP.To4() == nil {
			continue
		}
		out = append(out, ipnet.IP.String())
	}
	return out
}
