// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// `setUserName` conforms to `State.setUserName`: it replaces `userName` and logs
// the change.
import { describe } from "vitest";
import { State } from "../../../../data/state/state.js";
import { cases } from "../../../../data/state/set-user-name.test.js";
import { expectConforms } from "../../conformance/expect-conforms.js";
import { setUserName } from "./set-user-name.js";

describe("setUserName transaction conforms to State.setUserName", () => {
  expectConforms({
    cases,
    spec: State.setUserName,
    apply: (store, args) => setUserName(store, args),
  });
});
