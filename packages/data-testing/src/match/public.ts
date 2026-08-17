// © 2026 Adobe. MIT License. See /LICENSE for details.
// `ref` (id-correspondence) and its solver are internal: the conformance runner's
// `refify` generates them from schema-marked spec-ids, so no case authors one. The
// solving machinery stays in `matches`; only the public matchers are re-exported.
export { matches, type MatchOptions } from "./match.js";
export { assert } from "./assert.js";
export { anyNumber, anyString } from "./matchers.js";
