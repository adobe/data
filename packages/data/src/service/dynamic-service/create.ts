import { Observe } from "../../observe/index.js";
import { Schema } from "../../schema/index.js";
import type { Action, ActionError, State } from "./dynamic-service.js";
import type { DynamicService } from "./dynamic-service.js";

/**
 * Internal types for the create configuration entries.
 * These are the runtime shapes after going through the typed helpers.
 */
type StateEntry = {
    schema: Schema,
    enabled?: Observe<boolean>,
    value: Observe<unknown>
};

type ActionEntry = {
    description: string,
    schema: Schema | false,
    enabled?: Observe<boolean>,
    execute: (...args: any[]) => Promise<void | ActionError> | void
};

/**
 * Creates a typed state entry for use with `create()`.
 * Captures the schema type as a direct generic parameter, ensuring
 * Schema.ToType<S> resolves correctly for the value observable.
 */
export const state = <const S extends Schema>(config: {
    schema: S,
    enabled?: Observe<boolean>,
    value: Observe<Schema.ToType<S>>
}): StateEntry => config as StateEntry;

/**
 * Creates a typed action entry for use with `create()`.
 * Captures the schema type as a direct generic parameter, ensuring
 * Schema.ToType<S> resolves correctly for the execute input parameter.
 *
 * TypeScript cannot resolve Schema.ToType<AS[K]> through indexed access
 * types in mapped types for complex schemas (objects, arrays, etc.).
 * This helper works around that by using a direct generic S parameter.
 */
export const action: {
    <const S extends Schema>(config: {
        description: string,
        schema: S,
        enabled?: Observe<boolean>,
        execute: (input: Schema.ToType<S>) => Promise<void | ActionError> | void
    }): ActionEntry;
    (config: {
        description: string,
        schema: false,
        enabled?: Observe<boolean>,
        execute: () => Promise<void | ActionError> | void
    }): ActionEntry;
} = (config: any) => config as ActionEntry;

/**
 * Creates a DynamicService from a configuration of states and actions.
 *
 * Use `DynamicService.state()` and `DynamicService.action()` helpers
 * for each entry to get strict type inference on value observables
 * and execute input parameters:
 *
 * ```ts
 * DynamicService.create({
 *   states: {
 *     health: DynamicService.state({
 *       schema: { type: "number" },
 *       value: healthObserve,
 *     }),
 *   },
 *   actions: {
 *     heal: DynamicService.action({
 *       description: "Heal the player",
 *       schema: { type: "number" },
 *       execute: (input) => { // input: number ✓
 *         healPlayer(input);
 *       },
 *     }),
 *   },
 * });
 * ```
 */
export const create = (props: {
    states: Record<string, StateEntry>,
    actions: Record<string, ActionEntry>
}): DynamicService => {
    const alwaysEnabled = Observe.fromConstant(true);

    // Build per-state observables combining enabled + value
    const stateEntries = Object.entries(props.states);
    const perStateObservables: Record<string, Observe<unknown>> = {};
    const stateSchemas: Record<string, Schema> = {};

    for (const [key, entry] of stateEntries) {
        stateSchemas[key] = entry.schema;
        perStateObservables[key] = Observe.fromProperties({
            enabled: entry.enabled ?? alwaysEnabled,
            value: entry.value,
        });
    }

    const states: Observe<{ [key: string]: State }> = Observe.withMap(
        Observe.fromProperties(perStateObservables),
        (raw) => {
            const result: { [key: string]: State } = {};
            for (const [key, entry] of Object.entries(raw)) {
                const { enabled, value } = entry as { enabled: boolean, value: unknown };
                if (enabled) {
                    result[key] = { schema: stateSchemas[key], value } as State;
                }
            }
            return result;
        }
    );

    // Build per-action enabled observables, capture execute functions
    const actionEntries = Object.entries(props.actions);
    const actionMeta: Record<string, { description: string, schema: Schema | false, execute: Function }> = {};
    const enabledObservables: Record<string, Observe<unknown>> = {};

    for (const [key, entry] of actionEntries) {
        actionMeta[key] = { description: entry.description, schema: entry.schema, execute: entry.execute };
        enabledObservables[key] = entry.enabled ?? alwaysEnabled;
    }

    const actions: Observe<{ [key: string]: Action }> = Observe.withMap(
        Observe.fromProperties(enabledObservables),
        (enabledMap) => {
            const result: { [key: string]: Action } = {};
            for (const [key, enabled] of Object.entries(enabledMap)) {
                if (!enabled) continue;
                const { description, schema, execute } = actionMeta[key];
                result[key] = { description, schema, execute } as Action;
            }
            return result;
        }
    );

    // Track current actions for execute dispatch
    let currentActions: { [key: string]: Action } = {};
    actions((a) => { currentActions = a; });

    const execute = async (action: string, input: unknown): Promise<void | ActionError> => {
        const entry = currentActions[action];
        if (!entry) return `Action "${action}" is not available`;
        return (entry.execute as Function)(input);
    };

    return { serviceName: "dynamic-service", states, actions, execute };
}
