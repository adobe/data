// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `toggleSpriteActive` conforms to `State.toggleSpriteActive`: it flips the
// addressed sprite's `active` flag and is a no-op for an unknown id.
import { describe } from "vitest";
import { State } from "../../../../data/state/state.js";
import { cases } from "../../../../data/state/toggle-sprite-active.test.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { toggleSpriteActive } from "./toggle-sprite-active.js";

describe("toggleSpriteActive transaction conforms to State.toggleSpriteActive", () => {
  expectConforms({
    cases,
    spec: State.toggleSpriteActive,
    apply: (store, args, resolve) => toggleSpriteActive(store, { entity: resolve(args.id) }),
  });
});
