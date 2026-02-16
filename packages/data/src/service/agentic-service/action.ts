// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "../../schema/index.js";
import type { ActionError } from "./action-error.js";

export type Action<S extends Schema | false = Schema> = {
    description: string;
    schema: S;
    execute: Schema.ToType<S> extends void
        ? (() => Promise<void | ActionError> | void)
        : ((state: Schema.ToType<S>) => Promise<void | ActionError> | void);
};
