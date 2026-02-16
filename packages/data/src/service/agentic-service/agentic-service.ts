// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Observe } from "../../observe/index.js";
import type { Service } from "../index.js";
import type { Action } from "./action.js";
import type { ActionError } from "./action-error.js";
import type { State } from "./state.js";

/**
 * An agentic service provides a set of valid states and actions
 * which are conditionally available based upon the current state.
 * This is designed to serve as a foundation for agentic systems.
 * An MCP or other agentic protocol could be built upon this service interface.
 */
export interface AgenticService extends Service {

    states: Observe<{ [key: string]: State }>
    actions: Observe<{ [key: string]: Action }>
    execute: (action: string, input: unknown) => Promise<void | ActionError>

}

export * as AgenticService from "./public.js";
