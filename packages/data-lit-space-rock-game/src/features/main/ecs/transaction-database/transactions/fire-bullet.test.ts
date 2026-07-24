// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `fireBullet` conforms to `State.fireBullet`: it reads the seeded ship, defers
// the muzzle kinematics to the transform, and inserts the bullet — leaving any
// bullets already in flight untouched.
import { describe } from "vitest";
import { State } from "../../../data/state/state.js";
import { cases } from "../../../data/state/fire-bullet.cases.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { fireBullet } from "./fire-bullet.js";

describe("fireBullet transaction conforms to State.fireBullet", () => {
  expectConforms({
    cases,
    spec: State.fireBullet,
    apply: fireBullet,
  });
});
