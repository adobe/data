import { Observe } from "../../observe/index.js";
import { Schema } from "../../schema/index.js";
import { Service } from "../service.js";

export type State<S extends Schema = Schema> = {
    schema: S
    value: Schema.ToType<S>
}

export type Action<S extends Schema | false = Schema> = {
    description: string
    schema: S
    execute: Schema.ToType<S> extends void
    ? (() => Promise<void | ActionError> | void)
    : ((state: Schema.ToType<S>) => Promise<void | ActionError> | void)
}

export type ActionError = string;

/**
 * A dynamic service provides a set of valid states and actions
 * which are conditionally available basd upon the current state.
 * This is designed to serve as a foundation for agentic systems.
 * An MCP or other agentic protocol could be built upon this service interface.
 */
export interface DynamicService extends Service {

    states: Observe<{ [key: string]: State }>
    actions: Observe<{ [key: string]: Action }>
    execute: (action: string, input: unknown) => Promise<void | ActionError>

}

export * as DynamicService from "./public.js";

