import { Schema } from "../schema.js";
import jp, { PathComponent } from "jsonpath";
import { isValid } from "../validation/is-valid.js";

export type EnumeratePatch = {
    /** The path to the target node. */
    path: PathComponent[];
    /** The fragment that will be patched into the target. */
    fragment: unknown;
}

export function* enumeratePatches(
    currentSchema: Schema,
    currentValue: unknown,
    rootValue: unknown = currentValue,
    rootSchema: Schema = currentSchema,
    currentPath: PathComponent[] = ["$"],
    localPath: PathComponent[] = ["$"],
): Generator<EnumeratePatch> {
    // local conditionals
    for (const c of currentSchema.conditionals ?? []) {
        // get the value of the current path
        const localValue = jp.value(rootValue, jp.stringify(localPath));
        // if (currentSchema.conditionals) {
        //     console.log("enumeratePatches", JSON.stringify(c, null, 2));
        //     // console.log("currentPath", currentPath);
        //     // console.log("localPath", localPath);
        //     console.log("localValue", localValue);
        // }
        if (!c.match || isValid(c.match, localValue)) {
            // jsonpath.query returns *values*, not references to
            // the parent object.  We use jp.paths to get the JSONPaths
            // of selected nodes, then query again to fetch each node.
            for (const p of jp.paths(rootSchema, c.path)) {
                yield { path: p, fragment: c.value };
            }
        }
    }

    // recurse

    // items
    if (currentSchema.items && Array.isArray(currentValue)) {
        for (const [i, childSchema] of Object.entries(currentSchema.items)) {
            for (const val of currentValue) {
                yield* enumeratePatches(childSchema, val, rootValue, rootSchema, [...currentPath, "items", i], [...localPath, i]);
            }
        }
    }

    // properties
    if (currentSchema.properties && typeof currentValue === "object" && currentValue !== null) {
        for (const [k, childSchema] of Object.entries(currentSchema.properties)) {
            yield* enumeratePatches(childSchema, (currentValue as any)[k], rootValue, rootSchema, [...currentPath, "properties", k], [...localPath, k]);
        }
    }

    // oneOf 
    if (currentSchema.oneOf?.length) {
        for (const branch of currentSchema.oneOf) {
            if (isValid(branch, currentValue)) {
                yield* enumeratePatches(branch, currentValue, rootValue, rootSchema, [...currentPath, "oneOf"], [...localPath]);
            }
        }
    }
}
