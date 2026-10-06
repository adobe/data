// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "./database.js";

const mode = { type: "number", default: 0 } as const;

// POSITIVE — ordinary names compile.
export const ok = Database.Plugin.create({ components: { mode }, resources: { level: mode } });

// @ts-expect-error — `id` is reserved by the ECS
export const reservedComponent = Database.Plugin.create({ components: { id: mode } });

// @ts-expect-error — `nonShared` is reserved by the ECS
export const reservedResource = Database.Plugin.create({ resources: { nonShared: mode } });
