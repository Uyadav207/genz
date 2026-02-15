package research

// ProgressReporter receives step updates during a research run.
// Implementations can be no-op, log, or stream (e.g. SSE) for UI progress.
type ProgressReporter interface {
	Report(step string, detail map[string]interface{})
}

// NoopProgressReporter does nothing; use when progress is not needed.
type NoopProgressReporter struct{}

func (NoopProgressReporter) Report(step string, detail map[string]interface{}) {}
