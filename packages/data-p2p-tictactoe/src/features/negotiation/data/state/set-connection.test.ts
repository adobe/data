// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import type { ConnectionState } from "../connection-state/connection-state.js";
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";
import { expectStateMatches } from "./expect-state-matches.js";

export const cases: readonly ConformanceCase<{
  connection: ConnectionState;
  sessionId?: string | null;
}>[] = [
  {
    name: "records a connected state with a session id",
    before: { ...State.create(), connection: "connecting" },
    args: { connection: "connected", sessionId: "sess-1" },
    after: { ...State.create(), connection: "connected", sessionId: "sess-1" },
  },
  {
    name: "updates only the connection when no session id is supplied",
    before: { ...State.create(), connection: "connected", sessionId: "sess-1" },
    args: { connection: "disconnected" },
    after: { ...State.create(), connection: "disconnected", sessionId: "sess-1" },
  },
];

describe("State.setConnection", () => {
  for (const { name, before, args, after } of cases) {
    it(name, () => {
      expectStateMatches(State.setConnection(before, args), after);
    });
  }
});
