// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Observe } from "@adobe/data/observe";
import { AgenticService } from "@adobe/data/service";
import { BoardState } from "../../data/values/board-state/board-state.js";
import type { PlayerMark } from "../../data/values/player-mark/player-mark.js";
import type { ComputedDatabase } from "../computed/computed-database.js";
import { board, currentPlayer, isGameOver, winner } from "../computed/index.js";

// An agent that plays one mark: it sees the board, whether it is its turn, and the
// winner, and may play a move on its turn or reset a finished game. It calls the
// computeds directly because `db.computed` is not yet populated while services build.
export const createAgentService = (db: ComputedDatabase, agentMark: PlayerMark): AgenticService => {
  const gameOver = isGameOver(db);
  const yourTurn = Observe.withMap(
    Observe.fromProperties({ isGameOver: gameOver, currentPlayer: currentPlayer(db) }),
    ({ isGameOver, currentPlayer }) => !isGameOver && currentPlayer === agentMark,
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
      board: board(db),
      yourTurn,
      winner: winner(db),
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
