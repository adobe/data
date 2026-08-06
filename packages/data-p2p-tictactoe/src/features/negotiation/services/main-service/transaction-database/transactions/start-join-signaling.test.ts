// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe } from "vitest";
import { State } from "../../../../data/state/state.js";
import { cases } from "../../../../data/state/start-join-signaling.test.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { startJoinSignaling } from "./start-join-signaling.js";

describe("startJoinSignaling transaction conforms to State.startJoinSignaling", () => {
  expectConforms({
    cases,
    spec: (before) => State.startJoinSignaling(before),
    apply: (store) => startJoinSignaling(store),
  });
});
