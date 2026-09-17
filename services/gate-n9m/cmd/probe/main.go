// Command probe listens for N9M devices and prints what they send.
//
//	go run ./cmd/probe -addr :7001 -reply -capture ./captures
//
// Then point the device's server address at this machine. Use a spare server
// slot if you want to keep the production link untouched — though on the units
// tested so far the device talks to one server at a time, so a spare slot only
// sees traffic when the primary fails.
//
// Pipe the output through tools/watch.py for a readable live view.
package main

import (
	"context"
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"

	"avansat/gate-n9m/internal/probe"
)

func main() {
	cfg := probe.Config{}
	flag.StringVar(&cfg.Addr, "addr", ":7001", "TCP listen address")
	flag.StringVar(&cfg.CaptureDir, "capture", "", "directory for raw per-connection captures (empty disables)")
	flag.BoolVar(&cfg.Reply, "reply", false, "answer CONNECT and KEEPALIVE to keep the session alive")
	flag.IntVar(&cfg.MaskCmd, "maskcmd", 1, "MASKCMD sent on CONNECT: which history streams to accept (bit 0 = alarms)")
	flag.Parse()

	logger := log.New(os.Stdout, "", 0)

	// Ctrl-C should close the listener and let open sessions finish their
	// current read, not kill the process mid-frame and leave a truncated
	// capture behind.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := probe.New(cfg, logger).ListenAndServe(ctx); err != nil {
		logger.Fatalf("probe: %v", err)
	}
}
