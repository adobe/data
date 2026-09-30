// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ResourceSchema } from "@adobe/data/ecs";
import { ActivityLog } from "../values/activity-log/activity-log.js";

// The activity trail. Document scope.
export const log = { ...ActivityLog.schema, default: [] } satisfies ResourceSchema;
