import { Schema } from "../schema.js";
import { enumeratePatches } from "./enumerate-patches.js";
import jp from "jsonpath";

/**
 * Gets a dynamic schema from a static schema with conditionals and a current value.
 */
export function getDynamicSchema(schema: Schema, value: unknown): Schema {
    const copy = structuredClone(schema);
    for (const { path, fragment } of enumeratePatches(schema, value)) {
        const node = jp.value(copy, jp.stringify(path));
        console.log("node", node);
        if (typeof node !== "object" || node === null) {
            throw new Error(`Target node MUST be an object, found: ${JSON.stringify(node)} at ${jp.stringify(path)}`);
        }
        Object.assign(node, fragment);
    }
    return copy;
}
