// © 2026 Adobe. MIT License. See /LICENSE for details.
// ECS resources (singletons) — each binds a data-type schema.
import { PlayerMark } from "../../data/player-mark/player-mark.js";
import { Score } from "../../data/score/score.js";

export const firstPlayer = PlayerMark.schema;
export const xWins = Score.schema;
export const oWins = Score.schema;
export const draws = Score.schema;
