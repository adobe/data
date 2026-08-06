// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `setSpriteActive` conforms to `State.setSpriteActive`: it sets the addressed
// sprite's `active` flag and is a no-op for an unknown id.
import { describe } from "vitest";
import { State } from "../../../../data/state/state.js";
import { cases } from "../../../../data/state/set-sprite-active.test.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { setSpriteActive } from "./set-sprite-active.js";

describe("setSpriteActive transaction conforms to State.setSpriteActive", () => {
  expectConforms({
    cases,
    spec: State.setSpriteActive,
    apply: (store, args, resolve) =>
      setSpriteActive(store, { entity: resolve(args.id), active: args.active }),
  });
});
