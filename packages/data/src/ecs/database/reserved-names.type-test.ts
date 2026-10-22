// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "./database.js";

const mode = { type: "number", default: 0 } as const;

// POSITIVE — ordinary names compile.
export const ok = Database.Plugin.create({ components: { mode }, resources: { level: mode } });

// @ts-expect-error — `id` is reserved by the ECS
export const reservedComponent = Database.Plugin.create({ components: { id: mode } });

// @ts-expect-error — `nonShared` is reserved by the ECS
export const reservedResource = Database.Plugin.create({ resources: { nonShared: mode } });

// A name can't be both a component and a resource, in one plugin or across `extends`.
// @ts-expect-error — `mode` is already a component
export const clashSamePlugin = Database.Plugin.create({ components: { mode }, resources: { mode } });

const base = Database.Plugin.create({ components: { mode }, resources: { level: mode } });

// @ts-expect-error — `mode` is a component in the extended plugin
export const clashResourceOverComponent = Database.Plugin.create({ extends: base, resources: { mode } });

// @ts-expect-error — `level` is a resource in the extended plugin
export const clashComponentOverResource = Database.Plugin.create({ extends: base, components: { level: mode } });

// POSITIVE — distinct names across `extends` compile, and inference is preserved.
export const distinct = Database.Plugin.create({ extends: base, components: { other: mode }, resources: { more: mode } });
const distinctOtherSchema: typeof distinct.components.other = mode;
const distinctMoreSchema: typeof distinct.resources.more = mode;
void distinctOtherSchema; void distinctMoreSchema;
