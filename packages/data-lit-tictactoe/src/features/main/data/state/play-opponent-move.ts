// © 2026 Adobe. MIT License. See /LICENSE for details.
import { OpponentService } from "../../services/opponent-service/opponent-service.js";
import { playMove } from "./play-move.js";
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";

/**
 * Move-selection as an **injected service dependency**: the opponent's choice
 * cannot be computed from `state` alone, so the transition receives the
 * `opponent` port — keyed by the service name minus its `-service` suffix —
 * awaits its selected index, then delegates to the pure {@link playMove}. An
 * illegal index the port returns is ignored by `playMove`, keeping the
 * transition idempotent.
 *
 * Awaiting the async port makes the transition async (`Promise<State>`), but it
 * is still **deterministic given its dependency**: inject a fixed opponent and
 * the result is fixed — which is exactly how it is unit-tested.
 */
export const playOpponentMove = async (
  state: Pick<State, "board" | "firstPlayer">,
  { opponent }: { opponent: OpponentService },
): Promise<Pick<State, "board">> => {
  const index = await opponent.selectMove(state.board);
  return playMove(state, { index });
};

// Spec-owned cases, shared with the ecs `playOpponentMove` action. Each injects
// the deterministic double with the exact move schedule it needs and authors
// `after` against it — the case owns its fixture, not a shared published const.
// `selectMove` is a value-returning read, not a fire-and-forget side effect, so
// it is NOT declared in `effects` — the transition's whole observable result is
// the placed mark.
export const cases: Conformance<typeof playOpponentMove> = [
  {
    name: "plays the opponent's first selected move for the current player",
    before: {},
    args: { opponent: OpponentService.createFake([4]) },
    // The injected move is cell 4; the current player on an empty board is the
    // first player (X), so an X lands in the centre cell.
    after: { board: "    X    " },
  },
  {
    name: "plays the next mark onto a running board",
    before: { board: "    X    " },
    args: { opponent: OpponentService.createFake([0]) },
    // The injected move is cell 0; the current player alternates to O by move
    // count, so an O lands in the top-left cell.
    after: { board: "O   X    " },
  },
  {
    name: "ignores an illegal selected move, leaving the state unchanged",
    before: { board: "    X    " },
    args: { opponent: OpponentService.createFake([4]) },
    // Cell 4 is occupied — `playMove` rejects it, so the transition is a no-op.
    after: { board: "    X    " },
  },
];
