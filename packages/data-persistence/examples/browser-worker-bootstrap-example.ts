// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Browser usage example — WORKER SIDE.
//
// In a real app this file would live at e.g. `src/persistence-worker.ts`
// and be referenced from the main thread like:
//
//   new Worker(new URL('./persistence-worker.ts', import.meta.url), { type: 'module' })
//
// The bootstrap is intentionally tiny: OPFS acquisition and router wiring
// are handled by the package's own `browser-worker-bootstrap` module.
// You only need this file if you want to add custom startup logic (e.g.
// auth token injection, telemetry).

export {};

// Re-export the standard bootstrap. This is equivalent to pointing
// `new Worker(...)` at the package's own bootstrap directly:
//
//   new Worker(
//     new URL('@adobe/data-persistence/browser-worker-bootstrap', import.meta.url),
//     { type: 'module' }
//   )
//
// Most apps can skip writing a custom worker file and use the line above.
import "@adobe/data-persistence/browser-worker-bootstrap";
