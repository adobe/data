// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `createSprite` conforms to `State.createSprite`: it appends one sprite with the
// defaulted rotation and hovered/active flags, leaving existing sprites untouched.
import { describe } from "vitest";
import { State } from "../../../../data/state/state.js";
import { cases } from "../../../../data/state/create-sprite.test.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { createSprite } from "./create-sprite.js";

describe("createSprite transaction conforms to State.createSprite", () => {
  expectConforms({
    cases,
    spec: State.createSprite,
    apply: (store, args) => {
      createSprite(store, args);
    },
  });
});
