// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Observe } from "../../observe/index.js";
import { Schema } from "../../schema/index.js";
import { AgenticService } from "./agentic-service.js";

/** State declaration: has top-level `type` (JSON Schema) + `description` */
type StateDeclaration<S extends Schema & { type: string } = Schema & { type: string }> = S & {
    description: string;
};

/** Action declaration: `description`, optional `input` schema, no `type` */
type ActionDeclaration<I extends Schema | false | undefined = undefined> = {
    description: string;
    input?: I;
    type?: never;
};

type DeclarationEntry = StateDeclaration | ActionDeclaration<Schema | false | undefined>;
type Declarations = Record<string, DeclarationEntry>;

type ConditionalFromDeclarations<D extends Declarations> = Partial<{
    [K in keyof D]: Observe<boolean>;
}>;

function isStateDeclaration(entry: DeclarationEntry): entry is StateDeclaration {
    return "type" in entry && typeof (entry as StateDeclaration).type === "string";
}

function getActionSchema(entry: DeclarationEntry): Schema | false {
    if (isStateDeclaration(entry)) return false;
    const actionEntry = entry as ActionDeclaration;
    return actionEntry.input ?? false;
}

/**
 * Creates an AgenticService from a config with declaration, implementation, and optional conditional.
 *
 * Declaration: flat map of states (have `type`) and actions (have `description`, optional `input`).
 * Implementation: same keys, states → Observe<...>, actions → (input?) => ...
 * Conditional: optional per-key Observe<boolean> for enablement.
 */
export function create<const D extends Declarations>(config: {
    description: string;
    declaration: D;
    implementation: ImplementationFromDeclarations<D>;
    conditional?: ConditionalFromDeclarations<D>;
}): AgenticService.AgenticService {
    const { declaration, implementation, conditional } = config;
    const alwaysEnabled = Observe.fromConstant(true);

    const stateKeys: string[] = [];
    const actionKeys: string[] = [];
    const stateSchemas: Record<string, Schema> = {};
    const actionMeta: Record<string, { description: string; schema: Schema | false; execute: Function }> = {};

    for (const [key, entry] of Object.entries(declaration)) {
        if (isStateDeclaration(entry)) {
            stateKeys.push(key);
            stateSchemas[key] = entry as Schema;
        } else {
            actionKeys.push(key);
            const a = entry as ActionDeclaration;
            actionMeta[key] = {
                description: a.description,
                schema: getActionSchema(entry),
                execute: (implementation as Record<string, Function>)[key],
            };
        }
    }

    const perStateObservables: Record<string, Observe<unknown>> = {};
    for (const key of stateKeys) {
        const valueObs = (implementation as Record<string, Observe<unknown>>)[key];
        const enabledObs = conditional?.[key as keyof typeof conditional] ?? alwaysEnabled;
        perStateObservables[key] = Observe.fromProperties({
            enabled: enabledObs,
            value: valueObs,
        });
    }

    const enabledObservables: Record<string, Observe<unknown>> = {};
    for (const key of actionKeys) {
        enabledObservables[key] = conditional?.[key as keyof typeof conditional] ?? alwaysEnabled;
    }

    const states: Observe<{ [key: string]: AgenticService.State }> = Observe.withMap(
        Observe.fromProperties(perStateObservables),
        (raw) => {
            const result: { [key: string]: AgenticService.State } = {};
            for (const [key, entry] of Object.entries(raw)) {
                const { enabled, value } = entry as { enabled: boolean; value: unknown };
                if (enabled) {
                    result[key] = { schema: stateSchemas[key], value } as AgenticService.State;
                }
            }
            return result;
        }
    );

    const actions: Observe<{ [key: string]: AgenticService.Action }> = Observe.withMap(
        Observe.fromProperties(enabledObservables),
        (enabledMap) => {
            const result: { [key: string]: AgenticService.Action } = {};
            for (const [key, enabled] of Object.entries(enabledMap)) {
                if (!enabled) continue;
                const meta = actionMeta[key];
                if (meta) result[key] = meta as AgenticService.Action;
            }
            return result;
        }
    );

    let currentActions: { [key: string]: AgenticService.Action } = {};
    actions((a) => { currentActions = a; });

    const execute = async (actionName: string, input: unknown): Promise<void | AgenticService.Error> => {
        const entry = currentActions[actionName];
        if (!entry) return `Action "${actionName}" is not available`;
        return (entry.execute as Function)(input);
    };

    return { serviceName: "agentic-service", states, actions, execute };
}

/** Implementation map derived from declaration: states → Observe, actions → execute fn */
export type ImplementationFromDeclarations<D extends Declarations> = {
    [K in keyof D]:
    D[K] extends { type: string }
        ? Observe<Schema.ToType<D[K]>>
        : D[K] extends { input: infer I extends Schema | false }
            ? ExecuteFromSchema<I>
            : ExecuteFromSchema<false>;
};

type ExecuteFromSchema<S extends Schema | false> =
    S extends false
        ? (() => Promise<void | AgenticService.Error> | void)
        : ((input: Schema.ToType<S>) => Promise<void | AgenticService.Error> | void);
