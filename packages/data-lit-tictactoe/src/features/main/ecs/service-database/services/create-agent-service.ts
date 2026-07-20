// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Observe } from "@adobe/data/observe";
import { AgenticService } from "@adobe/data/service";
import { BoardState } from "../../data/board-state/board-state.js";
import type { PlayerMark } from "../../data/player-mark/player-mark.js";
import { board as boardComputed } from "../computed/board.js";
import type { ComputedDatabase } from "../computed-database.js";

const roleDescription = (mark: PlayerMark): string =>
  `You are playing as ${mark} in tic-tac-toe. Play to the best of your ability.`;

/**
 * Build an {@link AgenticService} that plays a single mark. The service
 * exposes the board, whether it is the agent's turn, the winner, and the
 * `playMove` / `resetGame` actions gated on those conditions.
 */
export const createAgentService = (
  db: ComputedDatabase,
  agentMark: PlayerMark,
): AgenticService => {
  const board = boardComputed(db);
  const isGameOver = Observe.withFilter(board, BoardState.isGameOver);
  const currentPlayer = Observe.withFilter(board, (nextBoard) =>
    BoardState.currentPlayer(nextBoard, db.resources.firstPlayer),
  );
  const yourTurn = Observe.withMap(
    Observe.fromProperties({ isGameOver, currentPlayer }),
    ({ isGameOver: over, currentPlayer: cur }) => !over && cur === agentMark,
  );

  return AgenticService.create({
    interface: {
      role: {
        type: "state",
        schema: { type: "string" as const },
        description: "Your role and objective",
      },
      board: {
        type: "state",
        schema: BoardState.schema,
        description: "Board state",
      },
      yourTurn: {
        type: "state",
        schema: { type: "boolean" as const },
        description: "True when it is your turn to play",
      },
      resetGame: {
        type: "action",
        description: "Reset the game after completion",
        parameters: [],
      },
      winner: {
        type: "state",
        schema: {
          type: "string" as const,
          enum: ["X", "O", "cat", null],
        },
        description: "Winner mark when game over",
      },
      playMove: {
        type: "action",
        description: `Play a ${agentMark} move on the board`,
        parameters: [
          {
            title: "index",
            type: "integer" as const,
            minimum: 0,
            maximum: 8,
          },
        ],
      },
    },
    implementation: {
      role: Observe.fromConstant(roleDescription(agentMark)),
      board,
      yourTurn,
      winner: Observe.withFilter(board, BoardState.getWinner),
      resetGame: async () => {
        db.transactions.restartGame();
      },
      playMove: async (index: number) => {
        db.transactions.playMove({ index });
      },
    },
    conditional: {
      resetGame: isGameOver,
      playMove: yourTurn,
    },
  });
};
