// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe } from "vitest";
import { State } from "../../../../data/state/state.js";
import { cases } from "../../../../data/state/move-presence.test.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { seedUserId } from "../../conformance/seed-user-id.js";
import { movePresence } from "./move-presence.js";

// `movePresence` reads the peer identity from the transaction `userId` (the peer's
// assigned mark). The `apply` closure seeds that identity from the case's `mark`,
// then dispatches the raw transaction with the plain `{ x, y }` payload.
describe("movePresence transaction conforms to State.movePresence", () => {
  expectConforms({
    cases,
    spec: State.movePresence,
    apply: (store, { mark, x, y }) => {
      seedUserId(store, mark);
      movePresence(store, { x, y });
    },
  });
});
