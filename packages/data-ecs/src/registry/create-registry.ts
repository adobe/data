import { layoutOf } from "../layout/layout.js";
import type { Schema } from "../schema/schema.js";
import { declareName } from "./declare-name.js";

/** `S` maps each name to the schema type its declaration requires. */
export type Registry<S> = {
    readonly schemas: { readonly [K in keyof S]?: S[K] };
    /** Registers a schema. Throws if the name is already declared, or if the schema declares a GPU layout it can't meet. */
    readonly register: <K extends keyof S & (string | symbol)>(name: K, schema: S[K]) => void;
};

const registered = new Map<string | symbol, Schema>();
let symbolNames = false;

/** Whether any component or resource is named by a symbol, so value objects need their symbol keys read too. */
export const hasSymbolNames = (): boolean => symbolNames;

/** The schema of any registered component or resource. */
export const schemaOf = (name: string | symbol): Schema | undefined => registered.get(name);

export const createRegistry = <S extends { readonly [K in keyof S]: Schema }>(kind: "component" | "resource"): Registry<S> => {
    const schemas: { [K in keyof S]?: S[K] } = {};
    const register = <K extends keyof S & (string | symbol)>(name: K, schema: S[K]): void => {
        layoutOf(schema);
        declareName(name, kind);
        schemas[name] = schema;
        registered.set(name, schema);
        if (typeof name === "symbol") symbolNames = true;
    };
    return { schemas, register };
};
