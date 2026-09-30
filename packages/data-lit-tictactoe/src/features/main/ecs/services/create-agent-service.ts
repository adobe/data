// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Observe } from "@adobe/data/observe";
import { AgenticService } from "@adobe/data/service";
import { BoardState } from "../../data/values/board-state/board-state.js";
import type { PlayerMark } from "../../data/values/player-mark/player-mark.js";
import type { TransactionDatabase } from "../transactions/transaction-database.js";
import { readBoard } from "../transactions/read-board.js";

// An agent that plays one mark: it sees the board, whether it is its turn, and the
// winner, and may play a move on its turn or reset a finished game. Services sit
// below computed, so it derives what it observes from the store and `BoardState`.
export const createAgentService = (db: TransactionDatabase, agentMark: PlayerMark): AgenticService => {
  const board = Observe.withCache(db.derive(readBoard));
  const gameOver = Observe.withFilter(board, BoardState.isGameOver);
  const yourTurn = Observe.withMap(
    Observe.fromProperties({ board, firstPlayer: db.observe.resources.firstPlayer }),
    ({ board, firstPlayer }) =>
      !BoardState.isGameOver(board) && BoardState.currentPlayer(board, firstPlayer) === agentMark,
  );

  return AgenticService.create({
    interface: {
      role: {
        type: "state",
        schema: { type: "string" },
        description: "Your role and objective",
      },
      board: {
        type: "state",
        schema: BoardState.schema,
        description: "Board state",
      },
      yourTurn: {
        type: "state",
        schema: { type: "boolean" },
        description: "True when it is your turn to play",
      },
      resetGame: {
        type: "action",
        description: "Reset the game after completion",
        parameters: [],
      },
      winner: {
        type: "state",
        schema: { type: "string", enum: ["X", "O", "cat", null] },
        description: "Winner mark when game over",
      },
      playMove: {
        type: "action",
        description: `Play a ${agentMark} move on the board`,
        parameters: [{ title: "index", type: "integer", minimum: 0, maximum: 8 }],
      },
    },
    implementation: {
      role: Observe.fromConstant(
        `You are playing as ${agentMark} in tic-tac-toe. Play to the best of your ability.`,
      ),
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
      resetGame: gameOver,
      playMove: yourTurn,
    },
  });
};
