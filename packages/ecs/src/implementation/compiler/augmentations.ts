// © 2026 Adobe. MIT License. See /LICENSE for details.
import { reductionOperators } from '../../interface/registry/reduction.js';
import { isEntity, isString, isStruct } from '../../interface/registry/schemas.js';
import type { Schema } from '../../interface/schema/schema.js';
import { declarationsName } from '../../interface/registry/ids.js';
import type { PassResult } from './input-schemas.js';
import type { Insertion } from './source-map.js';
import { createConverter, isNotData, isThrown, type Declarator, type Module, type Node, type Statement, type TypedProgram, type TypeHost, type TypeNode } from './type-schemas.js';

export type AugmentationHost = TypeHost;

type Block = Extract<Statement, { readonly type: "TSModuleDeclaration"; readonly global: false }>;
type Interface = Extract<Statement, { readonly type: "TSInterfaceDeclaration" }>;
type Member = Interface["body"]["body"][number];
type Property = Extract<Member, { readonly type: "TSPropertySignature" }>;
type Value = string | number | boolean | null | readonly Value[] | { readonly [field: string]: Value };

const kinds = { Components: "component", Resources: "resource", Traits: "trait" } as const;
const isKind = (name: string): name is keyof typeof kinds => name in kinds;

/** The interfaces of each top-level `declare module "@adobe/ecs"` block, with the block. */
const augmentationsOf = (module: Pick<Module, "program">): readonly { readonly block: Block; readonly interfaces: readonly Interface[] }[] =>
    module.program.body.flatMap(statement => {
        if (statement.type !== "TSModuleDeclaration" || statement.global !== false || statement.id.type !== "Literal" || statement.id.value !== "@adobe/ecs") return [];
        const body = statement.body?.type === "TSModuleBlock" ? statement.body.body : [];
        const interfaces = body.flatMap(inner => {
            const declared = inner.type === "ExportNamedDeclaration" ? inner.declaration : inner;
            return declared?.type === "TSInterfaceDeclaration" && isKind(declared.id.name) ? [declared] : [];
        });
        return [{ block: statement, interfaces }];
    });

/**
 * The operator each resource a module's `declare module "@adobe/ecs"` blocks declare with a `reduce` trait reduces
 * with, by its key's binding: what a kernel reducing into it folds with.
 */
export const reductionsIn = (program: TypedProgram): ReadonlyMap<string, string> => {
    const found = new Map<string, string>();
    for (const { interfaces } of augmentationsOf({ program })) {
        for (const declared of interfaces) {
            if (declared.id.name !== "Resources") continue;
            for (const member of declared.body.body) {
                if (member.type !== "TSPropertySignature" || !member.computed || member.key.type !== "Identifier") continue;
                const declaration = member.typeAnnotation?.typeAnnotation;
                if (declaration?.type !== "TSTypeLiteral") continue;
                for (const trait of declaration.members) {
                    if (trait.type !== "TSPropertySignature" || trait.computed || trait.key.type !== "Identifier" || trait.key.name !== "reduce") continue;
                    const value = trait.typeAnnotation?.typeAnnotation;
                    if (value?.type === "TSLiteralType" && value.literal.type === "Literal" && typeof value.literal.value === "string") found.set(member.key.name, value.literal.value);
                }
            }
        }
    }
    return found;
};

type Expression = Extract<Statement, { readonly type: "ExpressionStatement" }>["expression"];
type Call = Extract<Expression, { readonly type: "CallExpression" }>;

/** A call's statement forms as a bundle leaves them: alone, in a sequence, or `void`ed. */
const callsOf = (expression: Expression): readonly Call[] => {
    if (expression.type === "CallExpression") return [expression];
    if (expression.type === "SequenceExpression") return expression.expressions.flatMap(callsOf);
    if (expression.type === "UnaryExpression" && expression.operator === "void") return callsOf(expression.argument);
    return [];
};

/** An object literal's property named `name`, unless computed. */
const propertyNamed = (object: Extract<Expression, { readonly type: "ObjectExpression" }>, name: string): Expression | null => {
    for (const property of object.properties) {
        if (property.type === "Property" && !property.computed && property.key.type === "Identifier" && property.key.name === name) return property.value;
    }
    return null;
};

/**
 * The operator each resource a module's generated declarations give, by its key's binding: what a library's build in
 * library mode leaves of its declarations in its JavaScript. They record `key, "resource", { ..., reduce }` through the
 * function appended to the module, under any name a bundle gives it, or, inlined, set `{ kind: "resource", declaration }`
 * on the declarations map; the key is a top-level `Symbol()` constant.
 */
export const registeredReductionsIn = (program: TypedProgram): ReadonlyMap<string, string> => {
    const symbols = new Set<string>();
    for (const statement of program.body) {
        const declaration = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
        if (declaration?.type !== "VariableDeclaration" || declaration.kind !== "const") continue;
        for (const declarator of declaration.declarations) {
            const init = declarator.init;
            if (declarator.id.type === "Identifier" && init?.type === "CallExpression" && init.callee.type === "Identifier" && init.callee.name === "Symbol") symbols.add(declarator.id.name);
        }
    }
    /** The declaration a call records for a resource keyed by a `Symbol()` constant, by either form, with its key. */
    const recorded = ({ callee, arguments: parameters }: Call): { readonly key: string; readonly declaration: Expression } | null => {
        const [key, second, third] = parameters;
        if (key?.type !== "Identifier" || !symbols.has(key.name)) return null;
        if (second?.type === "Literal" && second.value === "resource" && third?.type === "ObjectExpression") return { key: key.name, declaration: third };
        const setsEntry = callee.type === "MemberExpression" && !callee.computed && callee.property.type === "Identifier" && callee.property.name === "set";
        if (!setsEntry || second?.type !== "ObjectExpression") return null;
        const kind = propertyNamed(second, "kind");
        const declaration = propertyNamed(second, "declaration");
        return kind?.type === "Literal" && kind.value === "resource" && declaration !== null ? { key: key.name, declaration } : null;
    };
    const found = new Map<string, string>();
    for (const statement of program.body) {
        if (statement.type !== "ExpressionStatement") continue;
        for (const call of callsOf(statement.expression)) {
            const entry = recorded(call);
            if (entry === null || entry.declaration.type !== "ObjectExpression") continue;
            const operator = propertyNamed(entry.declaration, "reduce");
            if (operator?.type === "Literal" && typeof operator.value === "string") found.set(entry.key, operator.value);
        }
    }
    return found;
};

type QueryName = Exclude<Extract<TypeNode, { readonly type: "TSTypeQuery" }>["exprName"], { readonly type: "TSImportType" }>;

type TypeName = Extract<TypeNode, { readonly type: "TSTypeReference" }>["typeName"];

/** A type reference's name and the namespaces it's read through. */
const typeNameParts = (name: TypeName | Extract<TypeName, { readonly type: "TSQualifiedName" }>["left"]): readonly string[] =>
    name.type === "Identifier" ? [name.name] : name.type === "TSQualifiedName" ? [...typeNameParts(name.left), name.right.name] : [];

/** A `typeof` query's name and the properties read from it; null for `this`. */
const qualifiedParts = (name: QueryName | Extract<QueryName, { readonly type: "TSQualifiedName" }>["left"]): readonly string[] | null => {
    if (name.type === "Identifier") return [name.name];
    if (name.type !== "TSQualifiedName") return null;
    const left = qualifiedParts(name.left);
    return left === null ? null : [...left, name.right.name];
};

/** The platform's Transferable classes, which `transfer` takes. */
const transferables: ReadonlySet<string> = new Set([
    "ArrayBuffer", "ImageBitmap", "OffscreenCanvas", "MessagePort", "VideoFrame", "AudioData",
    "ReadableStream", "WritableStream", "TransformStream", "RTCDataChannel",
]);

/** Tests and their helpers in the package, which declare keys as consumers do. */
const testModule = /\.(test|type-test|fixture|test-helper|cases)\.tsx?$/;

/** Whether a file is one of the package's own modules, whose built-in keys register themselves. */
const isLibraryModule = (path: string | null, file: string): boolean =>
    path !== null && (path.startsWith("interface/") || path.startsWith("implementation/")) && !testModule.test(file);

/** Whether a module's top level binds `name`: imported, or declared by a variable, function or class. */
const bindsAtTopLevel = (program: TypedProgram, name: string): boolean => program.body.some(statement => {
    if (statement.type === "ImportDeclaration") return statement.specifiers.some(specifier => specifier.local.name === name);
    const declared = statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration" ? statement.declaration : statement;
    if (declared?.type === "VariableDeclaration") return declared.declarations.some(declarator => declarator.id.type === "Identifier" && declarator.id.name === name);
    return (declared?.type === "FunctionDeclaration" || declared?.type === "ClassDeclaration") && declared.id?.name === name;
});

/** `base`, or it numbered, so the name appears nowhere in the code. */
const uniqueName = (code: string, base: string): string => {
    let name = base;
    for (let n = 1; new RegExp(`${name.replace("$", "\\$")}(?![\\w$])`).test(code); n++) name = `${base}${n}`;
    return name;
};

/** Whether a value matches a schema, as far as a literal default can be checked. */
const matches = (schema: Schema, value: Value): boolean => {
    if ("anyOf" in schema) return schema.anyOf.some(member => matches(member, value));
    if ("allOf" in schema) return schema.allOf.every(member => matches(member, value));
    if ("const" in schema) return JSON.stringify(schema.const) === JSON.stringify(value);
    switch (schema.type) {
        case "null": return value === null;
        case "boolean": return typeof value === "boolean";
        case "string": return typeof value === "string" && value.length >= (schema.minLength ?? 0) && value.length <= (schema.maxLength ?? Infinity);
        case "number": return typeof value === "number" && value >= (schema.minimum ?? -Infinity) && value <= (schema.maximum ?? Infinity);
        case "integer": return typeof value === "number" && Number.isInteger(value) && ("format" in schema || (value >= (schema.minimum ?? -Infinity) && value <= (schema.maximum ?? Infinity)));
        case "array": return Array.isArray(value) && value.length >= (schema.minItems ?? 0) && value.length <= (schema.maxItems ?? Infinity) && value.every(item => matches(schema.items, item));
        case "object": {
            if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
            const required = schema.required ?? Object.keys(schema.properties);
            return Object.entries(value).every(([field, item]) => field in schema.properties && matches(schema.properties[field] ?? { allOf: [] }, item))
                && required.every(field => field in value);
        }
        default: return false;
    }
};


const allowsNullSchema = (schema: Schema): boolean =>
    ("type" in schema && schema.type === "null") || ("const" in schema && schema.const === null) || ("anyOf" in schema && schema.anyOf.some(allowsNullSchema));

/**
 * Registers what each `declare module "@adobe/ecs"` block declares, so consumers never write registration: each
 * component and resource of `Components` and `Resources`, with the schema of its `type`, its `default` and its other
 * traits as declared, and each trait of `Traits` keyed by a symbol. A key is a top-level `Symbol()` constant of this
 * module, so importing a key registers it: its registration comes right after it, after any binding its declaration
 * names, and after a trait of this module it declares, wherever the block is. A literal default and the built-in
 * traits' values are checked as far as literals and types show; `default: typeof value` names a value, which the
 * registration passes. Returns null when the module declares nothing.
 */
export const augmentationInsertions = async (module: Module, host: AugmentationHost): Promise<PassResult | null> => {
    const { code, file } = module;
    if (!code.includes("@adobe/ecs") || !code.includes("declare module") || isLibraryModule(host.packagePath(file), file)) return null;
    const augmentations = augmentationsOf(module);
    if (augmentations.length === 0) return null;
    const converter = createConverter(host, file);
    const { fail } = converter;
    const insertions: Insertion[] = [];
    // A name the module doesn't use for the function appended to record its declarations.
    const record = uniqueName(code, "declare$");

    /**
     * Where a local binding has its value, which a registration naming it comes after: the end of the top-level
     * statement declaring it, and 0 for a function, hoisted with its value, or anything imported.
     */
    const endOfLocal = (name: string): number => {
        for (const statement of module.program.body) {
            const declared = statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration" ? statement.declaration : statement;
            if (declared?.type === "VariableDeclaration" && declared.declarations.some(declarator => declarator.id.type === "Identifier" && declarator.id.name === name)) return statement.end;
            if ((declared?.type === "ClassDeclaration" || declared?.type === "TSEnumDeclaration") && declared.id?.name === name) return statement.end;
        }
        return 0;
    };

    /** Whether an initializer is a call of the global `Symbol`. */
    const isSymbolCall = (init: Declarator["init"]): boolean => {
        let expression = init;
        while (expression !== null && (expression.type === "TSAsExpression" || expression.type === "TSSatisfiesExpression" || expression.type === "ParenthesizedExpression")) expression = expression.expression;
        return expression?.type === "CallExpression" && expression.callee.type === "Identifier" && expression.callee.name === "Symbol";
    };

    /**
     * Fails unless a key a block declares is a top-level `Symbol()` constant of this module, so importing the key
     * registers it.
     */
    const requireOwnKey = (name: string, at: Node, what: string): void => {
        const imported = module.imports.get(name);
        if (imported !== undefined) fail(module, at, `${what} ${name} is imported from "${imported.source}": declare it in the module that declares the key`);
        if (!isSymbolCall(module.constants.get(name)?.init ?? null)) fail(module, at, `${what} ${name} is a top-level \`Symbol()\` constant of this module`);
    };

    /** Fails unless a trait key a declaration names is a `Symbol()` constant, here or imported as a value. */
    const requireTraitKey = async (name: string, at: Node): Promise<void> => {
        const imported = module.imports.get(name);
        if (imported !== undefined && !imported.value) fail(module, at, `a trait's key names ${name}, imported as a type only: import it as a value, which the registration passes`);
        const found = await converter.constantNamed([name], module);
        if (!isSymbolCall(found?.declaration.init ?? null)) fail(module, at, `a trait's key ${name} is a top-level \`Symbol()\` constant, of this module or one it imports`);
    };

    /** Whether a type, as written, allows `null`, through the aliases it names. */
    const allowsNullType = async (type: TypeNode, at: Module, seen: Set<object>): Promise<boolean> => {
        if (type.type === "TSNullKeyword") return true;
        if (type.type === "TSParenthesizedType") return await allowsNullType(type.typeAnnotation, at, seen);
        if (type.type === "TSUnionType") {
            for (const member of type.types) if (await allowsNullType(member, at, seen)) return true;
            return false;
        }
        if (type.type !== "TSTypeReference" || type.typeArguments !== null) return false;
        const found = await converter.typeNamed(typeNameParts(type.typeName), at);
        if (found === null || typeof found === "string" || found.declaration.type !== "TSTypeAliasDeclaration" || seen.has(found.declaration)) return false;
        seen.add(found.declaration);
        return await allowsNullType(found.declaration.typeAnnotation, found.module, seen);
    };

    /** Whether a type, as written, is a Transferable class, or one or null, through the aliases it names. */
    const isTransferableType = async (type: TypeNode, at: Module, seen: Set<object>): Promise<boolean> => {
        if (type.type === "TSParenthesizedType") return await isTransferableType(type.typeAnnotation, at, seen);
        if (type.type === "TSUnionType") {
            const members = type.types.filter(member => member.type !== "TSNullKeyword");
            if (members.length === 0) return false;
            for (const member of members) if (!await isTransferableType(member, at, seen)) return false;
            return true;
        }
        if (type.type !== "TSTypeReference" || type.typeArguments !== null) return false;
        const parts = typeNameParts(type.typeName);
        const found = await converter.typeNamed(parts, at);
        if (found === "global") return parts.length === 1 && transferables.has(parts[0] ?? "");
        if (found === null || typeof found === "string" || found.declaration.type !== "TSTypeAliasDeclaration" || seen.has(found.declaration)) return false;
        seen.add(found.declaration);
        return await isTransferableType(found.declaration.typeAnnotation, found.module, seen);
    };

    /** Fails for a built-in trait whose value, or whose key's type, its literal and type show can't hold. */
    const checkBuiltIns = async (name: string, kind: "component" | "resource", type: TypeNode, schema: Schema | undefined, builtIns: ReadonlyMap<string, { readonly node: TypeNode; readonly text: string }>): Promise<void> => {
        const derived = builtIns.get("derived");
        if (derived !== undefined && derived.text !== "true") fail(module, derived.node, `${name}'s derived is \`true\``);
        if (derived !== undefined && kind !== "component") fail(module, derived.node, `${name} is a resource: only a component is derived`);
        const reference = builtIns.get("reference");
        if (reference !== undefined && reference.text !== `"owner"` && reference.text !== `"weak"`) fail(module, reference.node, `${name}'s reference is "owner" or "weak"`);
        if (reference !== undefined && (schema === undefined || !isEntity(schema))) fail(module, reference.node, `${name} is a reference, so a reference's type is Entity`);
        const within = builtIns.get("within");
        if (within !== undefined) {
            const host = within.node.type === "TSTypeQuery" && within.node.exprName.type === "Identifier" ? within.node.exprName.name : null;
            const found = host === null ? null : await converter.constantNamed([host], module);
            if (found === null || !isSymbolCall(found.declaration.init)) fail(module, within.node, `${name}'s within is \`typeof\` a component's key, a \`Symbol()\` constant`);
        }
        const transfer = builtIns.get("transfer");
        if (transfer !== undefined && (transfer.text !== "true" || schema !== undefined || !await isTransferableType(type, module, new Set()))) {
            fail(module, transfer.node, `${name}'s transfer takes a Transferable class: ${[...transferables].join(", ")}`);
        }
        const reduce = builtIns.get("reduce");
        if (reduce !== undefined && kind !== "resource") fail(module, reduce.node, `${name} is a component: only a resource is reduced`);
        if (reduce !== undefined && !reductionOperators.some(operator => JSON.stringify(operator) === reduce.text)) fail(module, reduce.node, `${name}'s reduce is one of ${reductionOperators.map(operator => `"${operator}"`).join(", ")}`);
        const placed = builtIns.get("thread");
        if (placed !== undefined && !/^"[^"]+"$/.test(placed.text)) fail(module, placed.node, `${name}'s thread is a thread's name`);
        if (placed !== undefined && schema !== undefined && isString(schema)) fail(module, placed.node, `${name} is a string: a string lives in shared memory, so it has no thread`);
        if (placed !== undefined && schema !== undefined && isStruct(schema)) fail(module, placed.node, `${name} is a struct: a struct lives in shared memory, so it has no thread`);
    };

    /** Where a trait a block of this module declares is registered, which what declares it comes after. */
    const traitPoints = new Map<string, number>();

    /** A trait's or default's value as code: a literal, or `typeof` a value, which names it; and that value's local binding. */
    const valueText = async (type: TypeNode, what: string): Promise<{ readonly text: string; readonly value?: Value; readonly local?: string }> => {
        if (type.type === "TSTypeQuery") {
            const named = type.exprName.type === "TSImportType" ? null : qualifiedParts(type.exprName);
            const [first] = named ?? [];
            if (named === null || first === undefined || type.typeArguments !== null) return fail(module, type, `${what} is a literal type, or \`typeof\` a value`);
            const imported = module.imports.get(first);
            if (imported !== undefined && !imported.value) fail(module, type, `${what} names ${first}, imported as a type only: import it as a value, which the registration passes`);
            return { text: named.join("."), local: imported === undefined ? first : undefined };
        }
        const value = await converter.valueOfType(type, module, new Set());
        return { text: JSON.stringify(value), value };
    };

    try {
        const shadowed = ["globalThis", "Symbol", "Map"].find(name => bindsAtTopLevel(module.program, name));
        const first = augmentations[0];
        if (shadowed !== undefined && first !== undefined) fail(module, first.block, `the module binds ${shadowed}, which the code recording its declarations uses`);
        // Traits first, so a component declaring one registers after it.
        const ordered = augmentations.flatMap(({ block, interfaces }) => interfaces.map(declared => ({ block, declared })))
            .sort((a, b) => Number(b.declared.id.name === "Traits") - Number(a.declared.id.name === "Traits"));
        for (const { declared } of ordered) {
            const interfaceName = declared.id.name;
            if (!isKind(interfaceName)) continue;
            const kind = kinds[interfaceName];
            for (const member of declared.body.body) {
                if (member.type !== "TSPropertySignature") {
                    if (member.type === "TSIndexSignature" || member.type === "TSMethodSignature") fail(module, member, `${interfaceName}'s members are keys and their declarations`);
                    continue;
                }
                const { key } = member;
                if (kind === "trait") {
                    // String-named traits are the package's own.
                    if (!member.computed || key.type !== "Identifier") return fail(module, member, "a trait of your own is keyed by a `Symbol()` constant: `[layer]: ...`");
                    requireOwnKey(key.name, member, "a trait's key");
                    const point = endOfLocal(key.name);
                    traitPoints.set(key.name, point);
                    insertions.push({ at: point, text: `\n${record}(${key.name}, "trait");` });
                    continue;
                }
                if (!member.computed || key.type !== "Identifier") return fail(module, member, `a ${kind}'s key is a \`Symbol()\` constant, declared as \`[key]: { type: ... }\``);
                requireOwnKey(key.name, member, `a ${kind}'s key`);
                const declaration = member.typeAnnotation?.typeAnnotation;
                if (declaration?.type !== "TSTypeLiteral") return fail(module, member, `${key.name}'s declaration is a type literal of its traits: \`{ type: ... }\``);
                converter.site.at = member.start;
                let at = endOfLocal(key.name);
                let typeNode: TypeNode | undefined;
                let defaultNode: TypeNode | undefined;
                const traits: string[] = [];
                let thread = false;
                /** The built-in traits declared, by name: their values' types and code. */
                const builtIns = new Map<string, { readonly node: TypeNode; readonly text: string }>();
                for (const trait of declaration.members) {
                    if (trait.type !== "TSPropertySignature" || trait.typeAnnotation === null) return fail(module, trait, `${key.name}'s traits are properties with values`);
                    const property: Property = trait;
                    const value = trait.typeAnnotation.typeAnnotation;
                    const name = !property.computed && property.key.type === "Identifier" ? property.key.name
                        : property.computed && property.key.type === "Identifier" ? null
                        : fail(module, trait, `${key.name}'s traits are named, or keyed by a trait's \`Symbol()\` constant`);
                    if (name === "type") typeNode = value;
                    else if (name === "default") defaultNode = value;
                    else {
                        const text = await valueText(value, `${key.name}'s trait`);
                        if (text.local !== undefined) at = Math.max(at, endOfLocal(text.local));
                        if (name === "thread") thread = true;
                        if (name !== null) builtIns.set(name, { node: value, text: text.text });
                        if (name === null && property.key.type === "Identifier") {
                            await requireTraitKey(property.key.name, trait);
                            at = Math.max(at, endOfLocal(property.key.name), traitPoints.get(property.key.name) ?? 0);
                        }
                        traits.push(name === null ? `[${property.key.type === "Identifier" ? property.key.name : ""}]: ${text.text}` : `${name}: ${text.text}`);
                    }
                }
                if (typeNode === undefined) return fail(module, member, `${key.name} declares its type: \`{ type: ... }\``);
                let schema: Schema | undefined;
                try {
                    schema = await converter.convert(typeNode, module, new Set(), "declaration");
                }
                catch (error) {
                    if (!isNotData(error)) throw error;
                    if (error.notData.node && !thread) fail(module, member, `${key.name} is a DOM Node, which lives on "main": declare \`thread: "main"\``);
                }
                await checkBuiltIns(key.name, kind, typeNode, schema, builtIns);
                const start = defaultNode === undefined ? undefined : await valueText(defaultNode, `${key.name}'s default`);
                if (start?.local !== undefined) at = Math.max(at, endOfLocal(start.local));
                if (schema !== undefined && start?.value !== undefined && !matches(schema, start.value)) fail(module, defaultNode ?? member, `${key.name}'s default isn't of its declared type`);
                const allowsNull = schema === undefined ? await allowsNullType(typeNode, module, new Set()) : allowsNullSchema(schema) || "default" in schema;
                if (kind === "resource" && start === undefined && !allowsNull) fail(module, member, `resource ${key.name} declares the value it starts at: \`default: ...\`, which a type allowing null may leave out`);
                const parts = schema === undefined ? [] : [`type: ${start === undefined ? JSON.stringify(schema) : `${JSON.stringify(schema).slice(0, -1)},"default":${start.text}}`}`];
                if (schema === undefined && start !== undefined) parts.push(`default: ${start.text}`);
                parts.push(...traits);
                insertions.push({ at, text: `\n${record}(${key.name}, "${kind}", ${parts.length === 0 ? "{}" : `{ ${parts.join(", ")} }`});` });
            }
        }
    }
    catch (error) {
        if (isThrown(error)) return { failure: error.typeFailure, dependencies: [...converter.read] };
        throw error;
    }
    if (insertions.length === 0) return null;
    insertions.push({ at: code.length, text: `\nfunction ${record}(key, kind, declaration) { (globalThis[Symbol.for(${JSON.stringify(declarationsName)})] ??= new Map()).set(key, { kind, declaration }); }\n` });
    return { insertions, dependencies: [...converter.read] };
};
