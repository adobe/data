// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { OpponentService } from "../../services/opponent-service/opponent-service.js";
import { playMove } from "./play-move.js";
import type { State } from "./state.js";

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
export const playOpponentMove = async <T extends Pick<State, "board" | "firstPlayer">>(
  state: T,
  { opponent }: { opponent: OpponentService },
): Promise<T> => {
  const index = await opponent.selectMove(state.board);
  return playMove(state, { index });
};
