// © 2026 Adobe. MIT License. See /LICENSE for details.
import { declareResource$ } from '../registry/declare.js';

/** The cadence's value, for the implementation: `Resource.Value<typeof cadence>`. */
export type Cadence = { readonly kind: "frame" } | { readonly kind: "fixed"; readonly step: number; readonly maxSteps?: number };

/**
 * When the world ticks: once per animation frame, `{ kind: "frame" }`, the default, or every `step` milliseconds,
 * `{ kind: "fixed", step }`. Under `fixed`, a beat that's behind runs at most `maxSteps` ticks, 4 by default, and drops
 * the rest of the debt; each tick's `clock.delta` is `step`.
 */
export const cadence = Symbol("cadence");

declare module '@adobe/ecs' {
    export interface Resources {
        [cadence]: { type: Cadence };
    }
}

declareResource$(cadence, {
    type: {
        anyOf: [
            { type: "object", properties: { kind: { const: "frame" } } },
            { type: "object", properties: { kind: { const: "fixed" }, step: { type: "number", minimum: 0 }, maxSteps: { type: "integer", minimum: 1 } }, required: ["kind", "step"] },
        ],
        default: { kind: "frame" },
    },
});
