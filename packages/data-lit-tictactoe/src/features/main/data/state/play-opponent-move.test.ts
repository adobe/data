// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import { OpponentService } from "../../services/opponent-service/opponent-service.js";
import { State } from "./state.js";
import { expectStateMatches } from "./expect-state-matches.js";

// The transition takes an injected service, so it is exercised directly with a
// deterministic double rather than the shared `{ before, args, after }` cases —
// the assertions lean on the double's PUBLISHED move schedule
// (`OpponentService.fakeMoves`, resolved in order), never on any hidden
// behaviour.
describe("State.playOpponentMove", () => {
  it("plays the opponent's first selected move for the current player", async () => {
    const opponent = OpponentService.createFake();
    const after = await State.playOpponentMove(
      { board: "         ", firstPlayer: "X", xWins: 0, oWins: 0, draws: 0 },
      { opponent },
    );
    // fakeMoves[0] === 4; the current player on an empty board is the first
    // player (X), so an X lands in the centre cell.
    expectStateMatches(after, {
      board: "    X    ", firstPlayer: "X", xWins: 0, oWins: 0, draws: 0,
    });
  });

  it("consumes the published moves in order across successive turns", async () => {
    const opponent = OpponentService.createFake();
    const first = await State.playOpponentMove(
      { board: "         ", firstPlayer: "X", xWins: 0, oWins: 0, draws: 0 },
      { opponent },
    );
    const second = await State.playOpponentMove(first, { opponent });
    // fakeMoves[0]=4 → X at centre; fakeMoves[1]=0 → O at top-left (the turn
    // alternates by move count).
    expectStateMatches(second, {
      board: "O   X    ", firstPlayer: "X", xWins: 0, oWins: 0, draws: 0,
    });
  });

  it("ignores an illegal selected move, leaving the state unchanged", async () => {
    // Published a single move onto an already-occupied cell — `playMove` rejects
    // it, so the transition is a no-op.
    const opponent = OpponentService.createFake([4]);
    const after = await State.playOpponentMove(
      { board: "    X    ", firstPlayer: "X", xWins: 0, oWins: 0, draws: 0 },
      { opponent },
    );
    expectStateMatches(after, {
      board: "    X    ", firstPlayer: "X", xWins: 0, oWins: 0, draws: 0,
    });
  });
});
