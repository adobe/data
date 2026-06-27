import type { MaterialDefinition } from "../material-definition.js";
import { toDefinitionFromUnknown } from "./to-definition.js";

export type FromJsonResult =
    | { readonly ok: true; readonly definitions: Readonly<Record<string, MaterialDefinition>> }
    | { readonly ok: false; readonly reason: "not_object" | "invalid_entry"; readonly name?: string };

export const fromJson = (input: unknown): FromJsonResult => {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
        return { ok: false, reason: "not_object" };
    }

    const definitions: Record<string, MaterialDefinition> = {};
    for (const [name, props] of Object.entries(input)) {
        const definition = toDefinitionFromUnknown(props as Record<string, unknown>);
        if (!definition) {
            return { ok: false, reason: "invalid_entry", name };
        }
        definitions[name] = definition;
    }

    return { ok: true, definitions };
};
