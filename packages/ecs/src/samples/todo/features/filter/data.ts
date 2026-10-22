// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Resource } from "../../../../index.js";

export type Filter = "all" | "active" | "completed";

export const filterSchema = { anyOf: [{ const: "all" }, { const: "active" }, { const: "completed" }] } as const;

/** Which todos the list shows: all, those not done, or those done. */
export const filter = Symbol("filter");

declare module "@adobe/ecs" {
    interface Resources {
        [filter]: { type: Filter };
    }
}

Resource.register(filter, { type: { ...filterSchema, default: "all" } });
