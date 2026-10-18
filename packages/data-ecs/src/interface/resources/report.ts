import { Resource } from '../resource/resource.js';
import type { Report } from '../world/report.js';

/** The last tick's report, written only by the world after each tick. */
export const report = Symbol("report");

declare module '@adobe/data-ecs' {
    export interface Resources {
        [report]: typeof reportTraits;
    }
}

const text = { type: "string" } as const;

const reportTraits = Resource.register(report, {
    type: {
        type: "object",
        properties: {
            failures: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        kind: { anyOf: [{ const: "system" }, { const: "finalizer" }, { const: "gpu" }, { const: "observer" }, { const: "thread" }] },
                        name: text,
                        message: text,
                        stack: { anyOf: [text, { type: "null" }] },
                    },
                },
            },
            skipped: { type: "array", items: text },
            dropped: { type: "integer", minimum: 0 },
            warnings: {
                type: "array",
                items: { type: "object", properties: { kind: { const: "blocking" }, name: text, message: text } },
            },
        },
        default: { failures: [], skipped: [], dropped: 0, warnings: [] },
    },
});
