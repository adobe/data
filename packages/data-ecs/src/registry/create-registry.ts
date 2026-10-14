import { layoutOf } from "../layout/layout.js";
import type { Schema } from "../schema/schema.js";
import { isTrait } from "../trait/register.js";
import { isReduction } from "./reduction.js";
import type { Name as TraitName } from "../trait/name.js";
import { declareName } from "./declare-name.js";

/** A registered declaration, as any consumer iterating components or resources sees it: its `type` and other traits. */
export type AnyDeclaration = { readonly type: Schema } & { readonly [T in TraitName]?: unknown };

/** `D` maps each name to the declaration its registration requires. */
export type Registry<D> = {
    /**
     * Registers a declaration: its `type` schema and its other traits, fixed from then on. Throws if the name is
     * already declared, a trait isn't registered, or the schema declares a GPU layout it can't meet.
     */
    readonly register: <K extends keyof D & (string | symbol)>(name: K, declaration: D[K]) => void;
    /** The frozen declaration of a registered name. */
    readonly declaration: (name: keyof D & (string | symbol)) => AnyDeclaration | undefined;
};

const registered = new Map<string | symbol, AnyDeclaration>();
let symbolNames = false;

/** Whether any component or resource is named by a symbol, so value objects need their symbol keys read too. */
export const hasSymbolNames = (): boolean => symbolNames;

/** The declaration of any registered component or resource. */
export const declarationOf = (name: string | symbol): AnyDeclaration | undefined => registered.get(name);

/** The value schema of any registered component or resource. */
export const schemaOf = (name: string | symbol): Schema | undefined => registered.get(name)?.type;

/** The constraint makes each `D[K]` an `AnyDeclaration` without evaluating `D`'s generic declaration type. */
export const createRegistry = <D extends { readonly [K in keyof D]: AnyDeclaration }>(kind: "component" | "resource"): Registry<D> => {
    const register = <K extends keyof D & (string | symbol)>(name: K, declaration: D[K]): void => {
        for (const trait of Reflect.ownKeys(declaration)) {
            if (!isTrait(trait)) throw new Error(`Cannot declare ${kind} ${String(name)}: ${String(trait)} isn't a registered trait.`);
        }
        const { type } = declaration;
        if (declaration.reference !== undefined && !("format" in type && type.format === "entity")) {
            throw new Error(`Cannot declare ${kind} ${String(name)}: a reference's type is Entity.schema.`);
        }
        if (declaration.derived === true && !("default" in type || "const" in type)) {
            throw new Error(`Cannot declare ${kind} ${String(name)}: a derived component's type has a default, which it starts at.`);
        }
        const layout = layoutOf(type);
        if (declaration.reduce !== undefined) {
            const operator = declaration.reduce;
            if (kind !== "resource") throw new Error(`Cannot declare ${kind} ${String(name)}: only a resource is reduced.`);
            if (!isReduction(operator)) throw new Error(`Cannot declare resource ${String(name)}: reduce is one of "+", "*", "min", "max", "&", "|" or "^".`);
            if (layout.kind !== "linear") throw new Error(`Cannot declare resource ${String(name)}: a reduced resource is numbers or booleans, stored in linear memory.`);
            if (layout.leaves.some(leaf => leaf.scalar === "boolean") && operator !== "&" && operator !== "|" && operator !== "^") {
                throw new Error(`Cannot declare resource ${String(name)}: booleans reduce with "&", "|" or "^".`);
            }
        }
        declareName(name, kind);
        registered.set(name, Object.freeze({ ...declaration }));
        if (typeof name === "symbol") symbolNames = true;
    };
    return { register, declaration: name => registered.get(name) };
};
