import { Resource } from '../resource/resource.js';

/**
 * When the world ticks: once per animation frame, or every `step` milliseconds. Under `fixed`, a beat that's behind
 * runs at most `maxSteps` ticks, 4 by default, and drops the rest of the debt; each tick's `clock.delta` is `step`.
 */
export type Cadence = { readonly kind: "frame" } | { readonly kind: "fixed"; readonly step: number; readonly maxSteps?: number };

/** The world's cadence: `{ kind: "frame" }` by default. */
export const cadence = Symbol("cadence");

declare module '@adobe/data-ecs' {
    export interface Resources {
        [cadence]: { type: Cadence };
    }
}

Resource.register(cadence, {
    type: {
        anyOf: [
            { type: "object", properties: { kind: { const: "frame" } } },
            { type: "object", properties: { kind: { const: "fixed" }, step: { type: "number", minimum: 0 }, maxSteps: { type: "integer", minimum: 1 } }, required: ["kind", "step"] },
        ],
        default: { kind: "frame" },
    },
});
