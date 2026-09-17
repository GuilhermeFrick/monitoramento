// Package test holds the test suite for gate-n9m, kept apart from the code it
// exercises.
//
// This is deliberately not the Go convention, which puts foo_test.go next to
// foo.go. The trade-off that comes with the separation:
//
//   - Tests can only reach exported identifiers. White-box tests of unexported
//     helpers are not possible from here. That happens to fit — every test
//     already went through the public API — but it means a future unexported
//     function has to be reached through whatever exported call uses it.
//
//   - Coverage of the packages under test needs an explicit flag, because
//     `go test` attributes coverage to the package being tested:
//
//     go test ./test/ -coverpkg=./internal/... -cover
//
// What the suite is built around: the bytes a real device sent. The fixtures in
// frame_test.go and probe_test.go are captures from an M1N2.0-STANDARD, not
// values derived from the spec — and the two disagree. When they do, the
// capture wins, and TestDecodeRealDeviceHeader is what keeps that decision from
// being quietly undone.
package test
