// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { PlayerMark } from "../../data/player-mark/player-mark.js";
import { Score } from "../../data/score/score.js";

export const resources = Database.resources({
  document: {
    firstPlayer: PlayerMark.schema,
    xWins: Score.schema,
    oWins: Score.schema,
    draws: Score.schema,
  },
});
