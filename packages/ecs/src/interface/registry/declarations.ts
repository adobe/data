// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Schema } from '../schema/schema.js';
import type { Key as TraitKey } from '../trait/key.js';
import { declarationsName } from './ids.js';
import { layoutOf } from './layout.js';
import { claimKey, declarationOf, failRegistration, firstKeyOf, installCatchUp, kindOf, labelOf, recordFailure, requireKey, sameDeclaration } from './names.js';
import { isReduction } from './reduction.js';
import { allowsNull, hasBoolean, isEntity, isString, isStruct } from './schemas.js';
import { addTrait, isTrait } from './traits.js';

/**
 * A registered declaration, as any consumer iterating components or resources sees it: its `type` and other traits.
 * Without `type`, the value isn't data. A resource's `default`, or a derived object's, is what it starts at, when its
 * schema has none.
 */
export type AnyDeclaration = { readonly type?: Schema & { readonly default?: unknown }; readonly default?: unknown } & { readonly [T in TraitKey]?: unknown };

/** The value schema of any registered component or resource, or undefined for a value that isn't data. */
export const schemaOf = (key: unknown): Schema | undefined => declarationOf(key)?.type;

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
 * The thread a registered declaration's value lives on: none for a struct or a string, which live in shared memory,
 * else its `thread` or `"world"`. Only a value with a struct or string schema is known to be one.
 */
export const threadOfDeclaration = (declaration: AnyDeclaration): string | null => {
    if (declaration.type !== undefined && (isStruct(declaration.type) || isString(declaration.type))) return null;
    return typeof declaration.thread === "string" ? declaration.thread : "world";
};

/** Throws for a declaration whose traits can't hold, so far as values tell: types check the rest. */
const check = (kind: "component" | "resource", key: symbol, declaration: AnyDeclaration): void => {
    const fail = (message: string): never => failRegistration(kind, key, message);
    for (const trait of Reflect.ownKeys(declaration)) {
        if (trait !== "default" && !isTrait(trait)) fail(`${labelOf(trait)} isn't a registered trait.`);
    }
    const { type } = declaration;
    if (type !== undefined && "default" in declaration && (kind === "component" || "default" in type)) {
        fail(kind === "component" ? "its schema holds its default." : "its default is given twice, by its schema and its declaration.");
    }
    try {
        layoutOf(type);
    }
    catch (error) {
        fail(error instanceof Error ? error.message : String(error));
    }
    if (declaration.reference !== undefined && !(type !== undefined && isEntity(type))) fail("a reference's type is Entity.schema.");
    // A cycle of `within` hosts closes when its last component registers, so it's found then.
    const cycle: symbol[] = [key];
    for (let host = declaration.within; typeof host === "symbol"; host = declarationOf(host)?.within) {
        const first = firstKeyOf(host);
        if (first === firstKeyOf(key)) fail(`components are within each other in a cycle: ${cycle.map(labelOf).sort().join(", ")}.`);
        if (cycle.includes(first)) break;
        cycle.push(first);
    }
    if (declaration.derived !== undefined && kind !== "component") fail("only a component is derived.");
    if (declaration.derived === true && declaration.within !== undefined) fail("a derived component's rule covers within.");
    if (declaration.derived === true && declaration.reference !== undefined) fail("a rule can't set a derived component's target, so it's no reference.");
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
        if (type !== undefined && isString(type)) fail("a string lives in shared memory, so it has no thread.");
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

/**
 * Registers a declaration of `kind` under `key`, fixed from then on. The same declaration again is accepted, and so is
 * a new symbol with the id of a key of this kind, as a module evaluated again makes it.
 */
const createRegistry = (kind: "component" | "resource") => (key: unknown, declaration: AnyDeclaration): void => {
    const symbol = requireKey(kind, key);
    const existing = kindOf(symbol);
    if (existing === kind && sameDeclaration(declarationOf(symbol), declaration)) return;
    if (existing === undefined) check(kind, symbol, declaration);
    claimKey(symbol, kind, declaration);
};

/** Registers a component: the package's own, and tests' keys made at runtime; the build declares every other. */
export const registerComponent = createRegistry("component");

/** Registers a resource: the package's own, and tests' keys made at runtime; the build declares every other. */
export const registerResource = createRegistry("resource");

/** The global map of what the build declared, made here when no generated code made it first. */
const declared = ((): Map<unknown, unknown> => {
    const name = Symbol.for(declarationsName);
    const found: unknown = Reflect.get(globalThis, name);
    if (found instanceof Map) return found;
    const made = new Map<unknown, unknown>();
    Reflect.set(globalThis, name, made);
    return made;
})();

/** Whether a value the generated code recorded is a declaration: an object of traits, as the build wrote it. */
const isDeclaration = (value: unknown): value is AnyDeclaration => typeof value === "object" && value !== null;

/** Registers one key the build declared, as its kind says. */
const registerDeclared = (key: unknown, entry: unknown): void => {
    const kind: unknown = typeof entry === "object" && entry !== null ? Reflect.get(entry, "kind") : undefined;
    const declaration: unknown = typeof entry === "object" && entry !== null ? Reflect.get(entry, "declaration") : undefined;
    if (kind === "trait") addTrait(key);
    else if (kind === "component" && isDeclaration(declaration)) registerComponent(key, declaration);
    else if (kind === "resource" && isDeclaration(declaration)) registerResource(key, declaration);
};

/** How many of the map's entries this copy registered. */
let seen = 0;
let catching = false;

/**
 * Registers what the build declared since this last ran, in the order modules evaluated, as each module registered
 * its keys when it was evaluated. A declaration that fails is recorded for its key's uses and thrown once, after the
 * rest register. Reads of keys while it runs see those registered so far.
 */
const catchUp = (): void => {
    if (catching || declared.size === seen) return;
    catching = true;
    let failure: unknown = undefined;
    try {
        let index = 0;
        for (const [key, entry] of declared) {
            if (index++ < seen) continue;
            seen++;
            try {
                registerDeclared(key, entry);
            }
            catch (error) {
                if (typeof key === "symbol") recordFailure(key, error instanceof Error ? error.message : String(error));
                failure ??= error;
            }
        }
    }
    finally {
        catching = false;
    }
    if (failure !== undefined) throw failure;
};

installCatchUp(catchUp);
