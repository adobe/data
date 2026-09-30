// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Scope } from "@adobe/data/ecs";
import type { ResourceSchema } from "@adobe/data/ecs";
import { GameStatus } from "../values/game-status/game-status.js";

export const status = { ...GameStatus.schema, ...Scope.session } satisfies ResourceSchema;
