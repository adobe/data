import type { Schema } from '../schema/schema.js';
import type { Name as TraitName } from '../trait/name.js';
import { layoutOf } from './layout.js';
import { declareName, kindOf } from './names.js';
import type { Registry } from './registry.js';
import { isReduction } from './reduction.js';
import { sameDeclaration } from './same-declaration.js';
import { allowsNull, hasBoolean, isEntity, isStruct } from './schemas.js';
import { isTrait } from './traits.js';

/**
 * A registered declaration, as any consumer iterating components or resources sees it: its `type` and other traits.
 * Without `type`, the value isn't data, and `default` is what it starts at.
 */
export type AnyDeclaration = { readonly type?: Schema; readonly default?: unknown } & { readonly [T in TraitName]?: unknown };


const registered = new Map<string | symbol, AnyDeclaration>();
let symbolNames = false;

/** The declaration of any registered component or resource. */
export const declarationOf = (name: string | symbol): AnyDeclaration | undefined => registered.get(name);

/** The value schema of any registered component or resource, or undefined for a value that isn't data. */
export const schemaOf = (name: string | symbol): Schema | undefined => registered.get(name)?.type;

/** Whether any component or resource is named by a symbol, so value objects need their symbol keys read too. */
export const hasSymbolNames = (): boolean => symbolNames;

/** Global constructors of Transferable values, where the platform has them. */
const transferables: readonly string[] = [
    "ArrayBuffer", "ImageBitmap", "OffscreenCanvas", "MessagePort", "VideoFrame", "AudioData",
    "ReadableStream", "WritableStream", "TransformStream", "RTCDataChannel",
];

/** Whether `value` is an instance of the global constructor `name`, where the platform has one. */
const isInstance = (value: unknown, name: string): boolean => {
    const constructor: unknown = Reflect.get(globalThis, name);
    return typeof constructor === "function" && value instanceof constructor;
};

/**
 * The thread a registered declaration's value lives on: none for a struct, else its `thread` or `"world"`. Only a
 * value with a struct schema is known to be a struct.
 */
export const threadOfDeclaration = (declaration: AnyDeclaration): string | null => {
    if (declaration.type !== undefined && isStruct(declaration.type)) return null;
    return typeof declaration.thread === "string" ? declaration.thread : "world";
};

/** Throws for a declaration whose traits can't hold, so far as values tell: types check the rest. */
const check = (kind: "component" | "resource", name: string | symbol, declaration: AnyDeclaration): void => {
    const fail = (message: string): never => { throw new Error(`Cannot declare ${kind} ${String(name)}: ${message}`); };
    for (const trait of Reflect.ownKeys(declaration)) {
        if (trait !== "default" && !isTrait(trait)) fail(`${String(trait)} isn't a registered trait.`);
    }
    const { type } = declaration;
    if (type !== undefined && "default" in declaration) fail("its schema holds its default.");
    try {
        layoutOf(type);
    }
    catch (error) {
        fail(error instanceof Error ? error.message : String(error));
    }
    if (declaration.reference !== undefined && !(type !== undefined && isEntity(type))) fail("a reference's type is Entity.schema.");
    if (declaration.derived !== undefined && kind !== "component") fail("only a component is derived.");
    if (declaration.derived === true && type !== undefined && !("default" in type || "const" in type || allowsNull(type))) {
        fail("a derived component's type has a default, which it starts at.");
    }
    if (declaration.reduce !== undefined) {
        const operator = declaration.reduce;
        if (kind !== "resource") fail("only a resource is reduced.");
        if (!isReduction(operator)) fail(`reduce is one of "+", "*", "min", "max", "&", "|" or "^".`);
        if (type === undefined || !isStruct(type)) fail("a reduced resource is a struct of numbers or booleans.");
        if (type !== undefined && hasBoolean(type) && operator !== "&" && operator !== "|" && operator !== "^") fail(`booleans reduce with "&", "|" or "^".`);
    }
    const { thread } = declaration;
    if (thread !== undefined) {
        if (typeof thread !== "string" || thread === "") fail("thread is a thread's name.");
        if (type !== undefined && isStruct(type)) fail("a struct lives in shared memory, so it has no thread.");
    }
    if (isInstance(declaration.default, "Node") && thread !== "main") fail(`a DOM Node lives on "main".`);
    const { transfer } = declaration;
    if (transfer !== undefined) {
        if (transfer !== true) fail("transfer is true.");
        if (type !== undefined) fail("a value with a schema is data, which isn't Transferable.");
        const value = declaration.default;
        if (value !== undefined && value !== null && !transferables.some(constructor => isInstance(value, constructor))) fail("its value isn't Transferable.");
    }
};

/** The constraint makes each `D[K]` an `AnyDeclaration` without evaluating `D`'s generic declaration type. */
export const createRegistry = <D extends { readonly [K in keyof D]: AnyDeclaration }>(kind: "component" | "resource"): Registry<D> => {
    const register = <K extends keyof D & (string | symbol)>(name: K, declaration: D[K]): void => {
        const existing = registered.get(name);
        if (existing !== undefined && kindOf(name) === kind && sameDeclaration(existing, declaration)) return;
        check(kind, name, declaration);
        declareName(name, kind);
        registered.set(name, declaration);
        if (typeof name === "symbol") symbolNames = true;
    };
    return { register };
};
