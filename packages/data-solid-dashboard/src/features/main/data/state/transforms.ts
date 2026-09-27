// © 2026 Adobe. MIT License. See /LICENSE for details.

// The conformed functions of this feature — every pure transform the spec verifies,
// and nothing else (helpers like `create` and `samples` are deliberately absent). Its
// keys ARE the conformance surface: the manifest's coverage guard
// (`Conformance.feature`) requires exactly one `*.cases.ts` module per key here, so
// adding a transform without cases — or cases without a transform — fails to compile.
export { increment } from "./increment.js";
export { decrement } from "./decrement.js";
export { reset } from "./reset.js";
export { setUserName } from "./set-user-name.js";
export { clearLog } from "./clear-log.js";
