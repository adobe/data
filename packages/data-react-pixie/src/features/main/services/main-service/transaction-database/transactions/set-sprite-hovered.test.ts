// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `setSpriteHovered` conforms to `State.setSpriteHovered`: it sets the addressed
// sprite's `hovered` flag and is a no-op for an unknown id. The spec `id` is
// resolved to the seeded entity.
import { describe } from "vitest";
import { State } from "../../../../data/state/state.js";
import { cases } from "../../../../data/state/set-sprite-hovered.test.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { setSpriteHovered } from "./set-sprite-hovered.js";

describe("setSpriteHovered transaction conforms to State.setSpriteHovered", () => {
  expectConforms({
    cases,
    spec: State.setSpriteHovered,
    apply: (store, args, resolve) =>
      setSpriteHovered(store, { entity: resolve(args.id), hovered: args.hovered }),
  });
});
