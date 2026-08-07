// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect } from "vitest";

// Asymmetric matchers for conformance-case values a case does not pin — chiefly
// a sprite `id`, which the ecs assigns from its own id-space, so the spec and
// the ecs projection satisfy the same case without agreeing on the value. Typed
// `any` (like vitest's `expect.any`), they slot straight into the value's slot
// (`id: number`). Centralised here so the `vitest` import lives in one place;
// they are test-only data and tree-shake out of the app build.
export const anyNumber = expect.any(Number);
export const anyString = expect.any(String);
