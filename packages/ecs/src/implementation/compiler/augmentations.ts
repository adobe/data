// © 2026 Adobe. MIT License. See /LICENSE for details.
import { reductionOperators } from '../../interface/registry/reduction.js';
import { isEntity, isString, isStruct, matchesSchema } from '../../interface/registry/schemas.js';
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

const allowsNullSchema = (schema: Schema): boolean =>
    ("type" in schema && schema.type === "null") || ("const" in schema && schema.const === null) || ("anyOf" in schema && schema.anyOf.some(allowsNullSchema));

/** A value as code: JSON, but -0 as itself, which JSON writes as 0. */
const codeOf = (value: unknown): string => {
    if (Object.is(value, -0)) return "-0";
    if (Array.isArray(value)) return `[${value.map(codeOf).join(",")}]`;
    if (typeof value === "object" && value !== null) return `{${Object.entries(value).map(([field, item]) => `${JSON.stringify(field)}:${codeOf(item)}`).join(",")}}`;
    return JSON.stringify(value);
};

/** Whether a schema's value is one a literal default can be: what the build reads from literal types. */
const isValue = (value: unknown): value is Value =>
    value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    || (Array.isArray(value) ? value.every(isValue) : typeof value === "object" && Object.values(value).every(isValue));

/** What a value declared without a default starts at, by its type: a value, a fresh `Map` or `Set` per world, or why neither. */
type Start = { readonly value: Value } | { readonly fresh: "Map" | "Set" } | { readonly none: string };

/** A schema's zero value: 0, false or "", each item's and field's, a union's literal that is one, or a fresh set or map. */
const zeroOf = (schema: Schema): Start => {
    if ("default" in schema && isValue(schema.default)) return { value: schema.default };
    if ("const" in schema) return { value: schema.const };
    if ("anyOf" in schema) {
        for (const member of schema.anyOf) if ("const" in member && (member.const === 0 || member.const === false || member.const === "")) return { value: member.const };
        return { none: schema.anyOf.every(member => "const" in member) ? `a union of literals without 0, false or "" starts at none of them: declare \`default:\` one of them` : "a union of types starts at none of them" };
    }
    if ("allOf" in schema) return { none: "a value of any type has no zero value" };
    switch (schema.type) {
        case "number": case "integer": {
            const minimum = "minimum" in schema ? schema.minimum ?? -Infinity : -Infinity;
            const maximum = "maximum" in schema ? schema.maximum ?? Infinity : Infinity;
            return minimum <= 0 && maximum >= 0 ? { value: 0 } : { none: "0 isn't one of its values" };
        }
        case "boolean": return { value: false };
        case "string": return (schema.minLength ?? 0) === 0 ? { value: "" } : { none: `"" isn't one of its values` };
        case "null": return { value: null };
        case "set": return { fresh: "Set" };
        case "map": return { fresh: "Map" };
        case "array": {
            const count = schema.minItems ?? 0;
            if (count === 0) return { value: [] };
            if (schema.maxItems !== count) return { none: `an array of ${count} items or more has no zero value` };
            const item = zeroOf(schema.items);
            return "value" in item ? { value: Array.from({ length: count }, () => item.value) } : { none: "fresh" in item ? "an item that's a set or a map has no zero value" : item.none };
        }
        case "object": {
            const value: { [field: string]: Value } = {};
            for (const field of schema.required ?? Object.keys(schema.properties)) {
                const property = schema.properties[field];
                const zero = property === undefined ? { none: "it isn't a property" } : zeroOf(property);
                if (!("value" in zero)) return { none: `its field ${field} starts at nothing: ${"fresh" in zero ? "a set or a map in a struct has no zero value" : zero.none}` };
                value[field] = zero.value;
            }
            return { value };
        }
    }
};

/**
 * Registers what each `declare module "@adobe/ecs"` block declares, so consumers never write registration: each
 * component and resource of `Components` and `Resources`, with the schema of its `type`, its `default` and its other
 * traits as declared, and each trait of `Traits` keyed by a symbol. A key is a top-level `Symbol()` constant of this
 * module, so importing a key registers it: its registration comes right after it, after any binding its declaration
 * names, and after a trait of this module it declares, wherever the block is. A literal default and the built-in
 * traits' values are checked as far as literals and types show. A resource or derived component without a literal
 * default starts at its type's: its namespaced schema's, null, a zero value, or a fresh `Map` or `Set` per world.
 * Returns null when the module declares nothing.
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

    /** An expression without the casts and parentheses around it. */
    const unwrapped = (expression: Declarator["init"]): Declarator["init"] => {
        let inner = expression;
        while (inner !== null && (inner.type === "TSAsExpression" || inner.type === "TSSatisfiesExpression" || inner.type === "TSNonNullExpression" || inner.type === "ParenthesizedExpression")) inner = inner.expression;
        return inner;
    };

    /** The names a name or a chain of non-computed property reads reads; null for any other expression. */
    const pathOf = (expression: NonNullable<Declarator["init"]>): readonly string[] | null => {
        if (expression.type === "Identifier") return [expression.name];
        if (expression.type !== "MemberExpression" || expression.computed || expression.property.type !== "Identifier" || expression.object.type === "Super") return null;
        const object = pathOf(expression.object);
        return object === null ? null : [...object, expression.property.name];
    };

    /** Whether a schema's value, as its module writes it, gives a `default`: in place, or through constants and spreads. */
    const holdsDefault = async (expression: Declarator["init"], at: Module, seen: Set<object>): Promise<boolean> => {
        const value = unwrapped(expression);
        if (value === null || seen.has(value)) return false;
        seen.add(value);
        if (value.type === "Identifier" || value.type === "MemberExpression") {
            const path = pathOf(value);
            const found = path === null ? null : await converter.constantNamed(path, at);
            return found !== null && await holdsDefault(found.declaration.init, found.module, seen);
        }
        if (value.type !== "ObjectExpression") return false;
        for (const property of value.properties) {
            if (property.type === "SpreadElement" ? await holdsDefault(property.argument, at, seen) : !property.computed && property.key.type === "Identifier" && property.key.name === "default") return true;
        }
        return false;
    };

    /** Whether the value a type's name names, as `Vec3` names its namespace beside its type, has a schema with a `default`. */
    const declaresSchemaDefault = async (path: readonly string[]): Promise<boolean> => {
        const member = await converter.constantNamed([...path, "schema"], module);
        if (member !== null) return await holdsDefault(member.declaration.init, member.module, new Set());
        const holder = await converter.constantNamed(path, module);
        const value = unwrapped(holder?.declaration.init ?? null);
        if (holder === null || value?.type !== "ObjectExpression") return false;
        for (const property of value.properties) {
            if (property.type === "Property" && !property.computed && property.key.type === "Identifier" && property.key.name === "schema") {
                return await holdsDefault(property.value, holder.module, new Set());
            }
        }
        return false;
    };

    /** A declaration's type's namespaced schema default, as code reading it, and the local binding it reads; null without one. */
    const namespacedDefault = async (type: TypeNode, name: string): Promise<{ readonly text: string; readonly local?: string } | null> => {
        if (type.type !== "TSTypeReference" || type.typeArguments !== null) return null;
        const path = typeNameParts(type.typeName);
        const [first] = path;
        if (first === undefined || !await declaresSchemaDefault(path)) return null;
        const imported = module.imports.get(first);
        if (imported !== undefined && !imported.value) fail(module, type, `${name}'s type ${path.join(".")} starts at its schema's default: import ${first} as a value, which the registration reads`);
        return { text: `${path.join(".")}.schema.default`, local: imported === undefined ? first : undefined };
    };

    /**
     * What a value of `type`, of `schema`, starts at as code: as `zeroOf` says, but each field of a struct and item of
     * a tuple written here starting at its own type's default, its namespaced schema's included, by the same rules;
     * and the local bindings that code reads.
     */
    const startOf = async (type: TypeNode, schema: Schema): Promise<{ readonly text: string; readonly locals: readonly string[] } | { readonly fresh: "Map" | "Set" } | { readonly none: string }> => {
        const unwrapped = type.type === "TSParenthesizedType" ? type.typeAnnotation : type;
        const inner = unwrapped.type === "TSTypeOperator" && unwrapped.operator === "readonly" && unwrapped.typeAnnotation !== undefined ? unwrapped.typeAnnotation : unwrapped;
        const namespaced = "default" in schema ? null : await namespacedDefault(inner, "it");
        if (namespaced !== null) return { text: namespaced.text, locals: namespaced.local === undefined ? [] : [namespaced.local] };
        const parts = inner.type === "TSTypeLiteral" && "type" in schema && schema.type === "object" && !("default" in schema)
            ? inner.members.flatMap(field => field.type === "TSPropertySignature" && !field.computed && field.key.type === "Identifier" && field.typeAnnotation !== null
                ? [{ name: field.key.name, type: field.typeAnnotation.typeAnnotation, schema: schema.properties[field.key.name] }] : [])
            : inner.type === "TSTupleType" && "type" in schema && schema.type === "array" && !("default" in schema)
                ? inner.elementTypes.flatMap((element, k) => element.type === "TSOptionalType" || element.type === "TSRestType" || element.type === "TSNamedTupleMember" ? [] : [{ name: String(k), type: element, schema: schema.items }])
                : null;
        if (parts === null || parts.length === 0) {
            const zero = zeroOf(schema);
            return "value" in zero ? { text: codeOf(zero.value), locals: [] } : zero;
        }
        const texts: string[] = [];
        const locals: string[] = [];
        for (const part of parts) {
            const started = part.schema === undefined ? { none: "it isn't a property" } : await startOf(part.type, part.schema);
            if (!("text" in started)) return { none: `its ${inner.type === "TSTupleType" ? "item" : "field"} ${part.name} starts at nothing: ${"fresh" in started ? "a set or a map in a struct has no zero value" : started.none}` };
            texts.push(inner.type === "TSTupleType" ? started.text : `${JSON.stringify(part.name)}: ${started.text}`);
            locals.push(...started.locals);
        }
        // Without a namespaced default inside, the schema's zero value says the same, as data.
        if (locals.length === 0) {
            const zero = zeroOf(schema);
            if ("value" in zero) return { text: codeOf(zero.value), locals };
        }
        return { text: inner.type === "TSTupleType" ? `[${texts.join(", ")}]` : `{ ${texts.join(", ")} }`, locals };
    };

    /** The platform class a value that isn't data starts as a fresh, empty instance of, per world: `Map` or `Set`, through the aliases it names. */
    const freshOf = async (type: TypeNode, at: Module, seen: Set<object>): Promise<"Map" | "Set" | null> => {
        const inner = type.type === "TSParenthesizedType" ? type.typeAnnotation : type;
        if (inner.type !== "TSTypeReference") return null;
        const parts = typeNameParts(inner.typeName);
        const found = await converter.typeNamed(parts, at);
        if (found === "global") {
            const [name] = parts;
            return parts.length === 1 && (name === "Map" || name === "Set") ? name : null;
        }
        if (found === null || typeof found === "string" || found.declaration.type !== "TSTypeAliasDeclaration" || seen.has(found.declaration)) return null;
        seen.add(found.declaration);
        return await freshOf(found.declaration.typeAnnotation, found.module, seen);
    };

    /** A declared default: a literal type, never `typeof` a value. */
    const literalDefault = async (type: TypeNode, name: string): Promise<Value> => {
        if (type.type === "TSTypeQuery") fail(module, type, `${name}'s default is a literal type, never \`typeof\` a value: without one, its type's zero value, null, or the default of its type's namespaced schema is what it starts at`);
        return await converter.valueOfType(type, module, new Set());
    };

    /** How to give a type's values a start no zero value gives: by a literal, its schema, or null for a value that isn't data. */
    const workaround = (type: TypeNode, data: boolean): string => {
        if (!data) return "let its type allow null, and give it a value once there is one";
        if (type.type === "TSTypeReference" && type.typeArguments !== null) return "declare `default:` as a literal, or give its schema one: `Schema.Type<{ ...; default: ... }>`";
        const name = type.type === "TSTypeReference" ? typeNameParts(type.typeName).join(".") : null;
        const named = name === null ? "a type of its own" : `\`${name}\``;
        return `declare \`default:\` as a literal, or declare ${named} with a namespace whose schema holds its default: \`type ${name ?? "Start"} = ...; const ${name ?? "Start"} = { schema: { ...; default: ... } }\``;
    };

    /** Where a trait a block of this module declares is registered, which what declares it comes after. */
    const traitPoints = new Map<string, number>();

    /** A trait's value as code: a literal, or `typeof` a value, which names it; and that value's local binding. */
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
        return { text: codeOf(value), value };
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
                const given = defaultNode === undefined ? undefined : await literalDefault(defaultNode, key.name);
                if (schema !== undefined && given !== undefined && !matchesSchema(schema, given)) fail(module, defaultNode ?? member, `${key.name}'s default isn't of its declared type`);
                let start = given === undefined ? undefined : codeOf(given);
                let fresh: "Map" | "Set" | null = null;
                // First a literal, then the type's schema's default; only resources and derived components need a start.
                const namespaced = given !== undefined || (schema !== undefined && "default" in schema) ? null : await namespacedDefault(typeNode, key.name);
                if (namespaced !== null) {
                    start = namespaced.text;
                    if (namespaced.local !== undefined) at = Math.max(at, endOfLocal(namespaced.local));
                }
                else if (given === undefined && (kind === "resource" || builtIns.has("derived")) && !(schema !== undefined && "default" in schema)) {
                    if (schema === undefined ? await allowsNullType(typeNode, module, new Set()) : allowsNullSchema(schema)) {
                        // It starts at null, as the world reads a value with neither.
                    }
                    else if (schema === undefined) {
                        fresh = await freshOf(typeNode, module, new Set());
                        if (fresh === null) fail(module, member, `${kind} ${key.name} isn't data, so it has no zero value: ${workaround(typeNode, false)}`);
                    }
                    else {
                        const zero = await startOf(typeNode, schema);
                        if ("fresh" in zero) fresh = zero.fresh;
                        else if ("none" in zero) fail(module, member, `${kind} ${key.name} starts at no value its type gives, since ${zero.none}; ${workaround(typeNode, true)}`);
                        // A constant is the one value it can start at, which the world reads from its schema.
                        else if (!("const" in schema)) {
                            start = zero.text;
                            for (const local of zero.locals) at = Math.max(at, endOfLocal(local));
                        }
                    }
                }
                const parts = schema === undefined ? [] : [`type: ${start === undefined ? codeOf(schema) : `${codeOf(schema).slice(0, -1)},"default":${start}}`}`];
                if (schema === undefined && start !== undefined) parts.push(`default: ${start}`);
                parts.push(...traits);
                if (fresh !== null) parts.push(`fresh: "${fresh}"`);
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
