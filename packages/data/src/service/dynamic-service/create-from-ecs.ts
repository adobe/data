import { Database } from "../../ecs/index.js";
import { Observe } from "../../observe/index.js";
import { Schema } from "../../schema/index.js";
import type { Action, ActionError, State } from "./dynamic-service.js";
import type { DynamicService } from "./dynamic-service.js";

export const createFromEcs = <
    D extends Database,
    const SS extends Record<string, Schema>,
    const AS extends Record<string, Schema | false>
>(
    database: D,
    props: {
        states: { [K in keyof SS]: {
            schema: SS[K],
            enabled: (db: D) => Observe<boolean>,
            value: (db: D) => Observe<Schema.ToType<SS[K]>>
        } },
        actions: { [K in keyof AS]: {
            schema: AS[K],
            enabled: (db: D) => Observe<boolean>,
            execute: Schema.ToType<AS[K]> extends void
            ? (db: D) => Promise<void | ActionError>
            : (db: D, input: Schema.ToType<AS[K]>) => Promise<void | ActionError>
        } }
    }
): DynamicService => {

    // Build per-state observables combining enabled + value
    const stateEntries = Object.entries(props.states) as [string, { schema: Schema, enabled: (db: D) => Observe<boolean>, value: (db: D) => Observe<unknown> }][];
    const perStateObservables: Record<string, Observe<unknown>> = {};
    const stateSchemas: Record<string, Schema> = {};

    for (const [key, entry] of stateEntries) {
        stateSchemas[key] = entry.schema;
        perStateObservables[key] = Observe.fromProperties({
            enabled: entry.enabled(database),
            value: entry.value(database),
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
    const actionEntries = Object.entries(props.actions) as [string, { schema: Schema | false, enabled: (db: D) => Observe<boolean>, execute: Function }][];
    const actionMeta: Record<string, { schema: Schema | false, execute: Function }> = {};
    const enabledObservables: Record<string, Observe<unknown>> = {};

    for (const [key, entry] of actionEntries) {
        actionMeta[key] = { schema: entry.schema, execute: entry.execute };
        enabledObservables[key] = entry.enabled(database);
    }

    const actions: Observe<{ [key: string]: Action }> = Observe.withMap(
        Observe.fromProperties(enabledObservables),
        (enabledMap) => {
            const result: { [key: string]: Action } = {};
            for (const [key, enabled] of Object.entries(enabledMap)) {
                if (!enabled) continue;
                const { schema, execute: rawExecute } = actionMeta[key];
                const execute = schema === false
                    ? () => (rawExecute as Function)(database)
                    : (input: unknown) => (rawExecute as Function)(database, input);
                result[key] = { schema, execute } as Action;
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
