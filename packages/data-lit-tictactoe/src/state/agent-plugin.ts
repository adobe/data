// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Observe } from "@adobe/data/observe";
import { AgenticService } from "@adobe/data/service";
import { BoardState } from "../types/board-state/board-state";
import type { PlayerMark } from "../types/player-mark/player-mark";
import { tictactoePlugin } from "./tictactoe-plugin";
import type { TictactoeDatabase } from "./tictactoe-plugin";

const roleDescription = (mark: PlayerMark): string =>
  `You are playing as ${mark} in tic-tac-toe. Play to the best of your ability.`;

const createTictactoeAgentService = (
  db: TictactoeDatabase,
  agentMark: PlayerMark,
): AgenticService => {
  const board = db.observe.resources.board;
  const isGameOver = Observe.withFilter(board, BoardState.isGameOver);
  const currentPlayer = Observe.withFilter(
    board,
    (nextBoard) =>
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

const tictactoeLinkDescriptions = { x: "Play as X", o: "Play as O" } as const;

const createTictactoeRootAgentService = (
  db: TictactoeDatabase,
): AgenticService => {
  const root = AgenticService.create({
    interface: {
      x: { type: "link", description: tictactoeLinkDescriptions.x },
      o: { type: "link", description: tictactoeLinkDescriptions.o },
    },
    implementation: {
      x: createTictactoeAgentService(db, "X"),
      o: createTictactoeAgentService(db, "O"),
    },
  });
  return { ...root, linkDescriptions: tictactoeLinkDescriptions } as AgenticService;
};

export const agentPlugin = Database.Plugin.create({
  extends: tictactoePlugin,
  services: {
    agent: (db): AgenticService => createTictactoeRootAgentService(db),
    agentX: (db): AgenticService => createTictactoeAgentService(db, "X"),
    agentO: (db): AgenticService => createTictactoeAgentService(db, "O"),
  },
});
