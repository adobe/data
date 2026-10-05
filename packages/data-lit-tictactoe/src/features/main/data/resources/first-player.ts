// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ResourceSchema } from "@adobe/data/ecs";
import { PlayerMark } from "../values/player-mark/player-mark.js";

// Who moves first in the current game; alternates on every restart.
export const firstPlayer = PlayerMark.schema satisfies ResourceSchema;
