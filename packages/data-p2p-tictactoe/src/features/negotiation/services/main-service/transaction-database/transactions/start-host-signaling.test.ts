// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe } from "vitest";
import { State } from "../../../../data/state/state.js";
import { cases } from "../../../../data/state/start-host-signaling.test.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { startHostSignaling } from "./start-host-signaling.js";

describe("startHostSignaling transaction conforms to State.startHostSignaling", () => {
  expectConforms({
    cases,
    spec: (before) => State.startHostSignaling(before),
    apply: (store) => startHostSignaling(store),
  });
});
