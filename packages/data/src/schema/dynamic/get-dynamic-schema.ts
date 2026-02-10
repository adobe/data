// © 2026 Adobe. MIT License. See /LICENSE for details.
import { normalize } from "../../normalize.js";
import { deepMerge } from "./deep-merge.js";
import { Schema } from "../schema.js";
import { enumeratePatches } from "./enumerate-patches.js";
import jp from "jsonpath";

/**
 * Gets a dynamic schema from a static schema with conditionals and a current value.
 */
export function getDynamicSchema(schema: Schema, value: unknown): Schema {
    let input = schema;
    for (let i = 0; i < 20; i++) {
        const output = structuredClone(input);
        for (const { path, fragment } of enumeratePatches(input, value)) {
            const node = jp.value(output, jp.stringify(path));
            if (typeof node !== "object" || node === null) {
                throw new Error(`Target node MUST be an object, found: ${JSON.stringify(node)} at ${jp.stringify(path)}`);
            }
            Object.assign(node, deepMerge(node, fragment, { mergeArrays: false }));
        }
        if (JSON.stringify(normalize(input)) === JSON.stringify(normalize(output))) {
            return output;
        }
        input = output;
    }
    throw new Error("Failed resolve stable dynamic schema");
}
