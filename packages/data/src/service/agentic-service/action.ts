// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Data } from "../../data.js";
import { Schema } from "../../schema/index.js";

type ParametersFromSchemas<P extends readonly Schema[]> = {
    [K in keyof P]: P[K] extends Schema ? Schema.ToType<P[K]> : never;
};

export type Action<P extends readonly Schema[] = readonly Schema[]> = {
    description: string;
    parameters: P;
    execute: (...input: ParametersFromSchemas<P>) => Promise<void | Data> | Data | void;
};
