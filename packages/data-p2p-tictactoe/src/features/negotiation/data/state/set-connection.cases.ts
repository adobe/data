// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { setConnection } from "./set-connection.js";

// Inert, spec-owned cases for `setConnection`, shared with the ecs `setConnection`
// transaction and action. Omitting `sessionId` leaves the existing value untouched.
export const cases: Conformance.SpecCases<State, typeof setConnection> = {
  cases: [
    {
      name: "records a connected state with a session id",
      before: { connection: "connecting" },
      args: { connection: "connected", sessionId: "sess-1" },
      after: { connection: "connected", sessionId: "sess-1" },
    },
    {
      name: "updates only the connection when no session id is supplied",
      before: { connection: "connected", sessionId: "sess-1" },
      args: { connection: "disconnected" },
      after: { connection: "disconnected" },
    },
  ],
};
