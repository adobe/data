// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// The `actions` plugin facet. Only `trackPresence` (the UI-facing streaming pump)
// is registered. The same-named per-transition action `move-presence.ts` (the
// discrete realization of `State.movePresence`) is deliberately NOT re-exported
// into the facet: it is conformance-only and the UI never dispatches it (it uses
// the streaming `trackPresence`). It lives beside this barrel as a plain function
// exercised directly by `conformance/actions.test.ts` — mirroring how the
// reference runner imports and calls action functions, never through `db.actions`.
export * from "./track-presence.js";
