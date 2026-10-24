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

/** A value as code: JSON, but -0 and the numbers JSON can't write as themselves. */
const codeOf = (value: unknown): string => {
    if (Object.is(value, -0)) return "-0";
    if (typeof value === "number" && !Number.isFinite(value)) return Number.isNaN(value) ? "NaN" : value > 0 ? "Infinity" : "-Infinity";
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
 * What a resource reduced with `operator` starts at when it declares no start: the operator's identity, leaf by leaf,
 * as a fold of no contributions leaves it; null for a schema of other leaves. Used only when it's one of the
 * schema's values.
 */
const identityOf = (schema: Schema, operator: unknown): Value | null => {
    if ("type" in schema && schema.type === "boolean") return operator === "&";
    if ("type" in schema && (schema.type === "number" || schema.type === "integer")) {
        const minimum = "minimum" in schema ? schema.minimum : undefined;
        const maximum = "maximum" in schema ? schema.maximum : undefined;
        switch (operator) {
            case "+": case "|": case "^": return 0;
            case "*": return 1;
            // Every bit of its column set: u32's all ones, else -1.
            case "&": return minimum !== undefined && minimum >= 0 && maximum !== undefined && maximum <= 0xFFFFFFFF ? 0xFFFFFFFF : -1;
            case "min": return maximum ?? Infinity;
            case "max": return minimum ?? -Infinity;
            default: return null;
        }
    }
    if ("type" in schema && schema.type === "array" && schema.minItems !== undefined && schema.minItems === schema.maxItems) {
        const item = identityOf(schema.items, operator);
        return item === null ? null : Array.from({ length: schema.minItems }, () => item);
    }
    if ("type" in schema && schema.type === "object") {
        const value: { [field: string]: Value } = {};
        for (const [field, property] of Object.entries(schema.properties)) {
            const leaf = identityOf(property, operator);
            if (leaf === null) return null;
            value[field] = leaf;
        }
        return value;
    }
    return null;
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

    /** A value as its module writes it, and whether an `as const` around it makes what it writes in place readonly. */
    type Written = { readonly expression: NonNullable<Declarator["init"]>; readonly module: Module; readonly constant: boolean; readonly annotation?: TypeNode };

    /**
     * The outermost assertion on an expression, under parentheses, `satisfies` and `!`: "const" for `as const`, the
     * type of any other `as`, or null without one.
     */
    const outerAssertion = (expression: Declarator["init"]): "const" | TypeNode | null => {
        let inner = expression;
        while (inner !== null && (inner.type === "TSSatisfiesExpression" || inner.type === "TSNonNullExpression" || inner.type === "ParenthesizedExpression")) inner = inner.expression;
        if (inner?.type !== "TSAsExpression") return null;
        const { typeAnnotation } = inner;
        return typeAnnotation.type === "TSTypeReference" && typeAnnotation.typeName.type === "Identifier" && typeAnnotation.typeName.name === "const" ? "const" : typeAnnotation;
    };

    /** Whether an expression's outermost assertion is `as const`. */
    const isConstAssertion = (expression: Declarator["init"]): boolean => outerAssertion(expression) === "const";

    /** The `default` property's value of an object a module writes: in place, or through constants and spreads. */
    const defaultProperty = async (expression: Declarator["init"], at: Module, constant: boolean, seen: Set<object>): Promise<Written | null> => {
        const value = unwrapped(expression);
        if (value === null || seen.has(value)) return null;
        seen.add(value);
        const inConst = constant || isConstAssertion(expression);
        if (value.type === "Identifier" || value.type === "MemberExpression") {
            const path = pathOf(value);
            const found = path === null ? null : await converter.constantNamed(path, at);
            return found === null ? null : await defaultProperty(found.declaration.init, found.module, false, seen);
        }
        if (value.type !== "ObjectExpression") return null;
        for (const property of value.properties) {
            if (property.type === "SpreadElement") {
                const found = await defaultProperty(property.argument, at, inConst, seen);
                if (found !== null) return found;
            }
            else if (!property.computed && property.key.type === "Identifier" && property.key.name === "default") {
                return { expression: property.value, module: at, constant: inConst };
            }
        }
        return null;
    };

    /** The value of a type's namespace's `default`, as `Vec3` names its namespace beside its type: a namespace's export, or a constant object's property. */
    const defaultWritten = async (path: readonly string[]): Promise<Written | null> => {
        const member = await converter.constantNamed([...path, "default"], module);
        if (member !== null && member.declaration.init !== null) {
            const annotation = member.declaration.id.type === "Identifier" ? member.declaration.id.typeAnnotation?.typeAnnotation : undefined;
            return { expression: member.declaration.init, module: member.module, constant: false, annotation };
        }
        const holder = await converter.constantNamed(path, module);
        return holder === null ? null : await defaultProperty(holder.declaration.init, holder.module, false, new Set());
    };

    /**
     * Whether a type is deeply readonly as written: no array, field, map or set of it can change in place. `fields`
     * takes an object's fields as readonly, as `Readonly<...>` makes them.
     */
    const readonlyType = async (type: TypeNode, at: Module, seen: Set<object>, fields = false): Promise<boolean> => {
        switch (type.type) {
            case "TSNumberKeyword": case "TSStringKeyword": case "TSBooleanKeyword": case "TSBigIntKeyword": case "TSNullKeyword": case "TSUndefinedKeyword": case "TSLiteralType": return true;
            case "TSParenthesizedType": return await readonlyType(type.typeAnnotation, at, seen);
            case "TSUnionType": return (await Promise.all(type.types.map(member => readonlyType(member, at, seen)))).every(Boolean);
            case "TSTypeOperator": {
                if (type.operator !== "readonly") return false;
                const inner = type.typeAnnotation.type === "TSParenthesizedType" ? type.typeAnnotation.typeAnnotation : type.typeAnnotation;
                if (inner.type === "TSArrayType") return await readonlyType(inner.elementType, at, seen);
                if (inner.type === "TSTupleType") {
                    return (await Promise.all(inner.elementTypes.map(element => element.type === "TSOptionalType" || element.type === "TSRestType" || element.type === "TSNamedTupleMember" ? false : readonlyType(element, at, seen)))).every(Boolean);
                }
                return false;
            }
            case "TSTypeLiteral": {
                for (const member of type.members) {
                    if (member.type !== "TSPropertySignature" || (member.readonly !== true && !fields) || member.typeAnnotation === null || !await readonlyType(member.typeAnnotation.typeAnnotation, at, seen)) return false;
                }
                return true;
            }
            case "TSTypeReference": {
                const parts = typeNameParts(type.typeName);
                const parameters = type.typeArguments?.params ?? [];
                const [only] = parts;
                if (parts.length === 1 && only !== undefined && !at.types.has(only) && !at.imports.has(only) && (only === "ReadonlyMap" || only === "ReadonlySet" || only === "ReadonlyArray")) {
                    return (await Promise.all(parameters.map(parameter => readonlyType(parameter, at, seen)))).every(Boolean);
                }
                const [argument] = parameters;
                if (parts.length === 1 && only === "Readonly" && !at.types.has(only) && !at.imports.has(only) && argument !== undefined) return await readonlyType(argument, at, seen, true);
                const found = await converter.typeNamed(parts, at);
                if (found === null || typeof found === "string" || seen.has(found.declaration)) return false;
                // A type a schema names, as the package's math types are, is a readonly value.
                if (host.packagePath(found.module.file) === "interface/schema/schema" && found.declaration.id?.name === "Type") return true;
                if (host.packagePath(found.module.file) === "interface/entity/entity" && found.declaration.id?.name === "Entity") return true;
                seen.add(found.declaration);
                if (found.declaration.type === "TSTypeAliasDeclaration") return found.declaration.typeParameters === null && await readonlyType(found.declaration.typeAnnotation, found.module, seen, fields);
                if (found.declaration.type !== "TSInterfaceDeclaration" || found.declaration.extends.length > 0) return false;
                for (const member of found.declaration.body.body) {
                    if (member.type !== "TSPropertySignature" || (member.readonly !== true && !fields) || member.typeAnnotation === null || !await readonlyType(member.typeAnnotation.typeAnnotation, found.module, seen)) return false;
                }
                return true;
            }
            default: return false;
        }
    };

    /** Where a value a module writes isn't evidently readonly: the part that isn't, and why. */
    type Unreadonly = { readonly module: Module; readonly expression: NonNullable<Declarator["init"]>; readonly why: string };

    /** The source text of a part of a module, for failures. */
    const textOf = (at: Module, expression: { readonly start: number; readonly end: number }): string => at.code.slice(expression.start, expression.end);

    /**
     * Where a value a module writes isn't deeply readonly by its type, or null when it is: a literal, `as const` data, a
     * binding typed readonly, or a call of a function whose declared return type is readonly.
     */
    const unreadonly = async (written: Written, seen: Set<object>): Promise<Unreadonly | null> => {
        const { module: at, annotation, expression } = written;
        const failing = (why: string): Unreadonly => ({ module: at, expression, why: `\`${textOf(at, expression)}\` ${why}` });
        if (annotation !== undefined) return await readonlyType(annotation, at, seen) ? null : failing("is typed with a type that isn't readonly");
        // A cast to a type is that type, whatever `as const` around it says.
        const assertion = outerAssertion(expression);
        if (assertion !== null && assertion !== "const") return await readonlyType(assertion, at, seen) ? null : failing("is cast to a type that isn't readonly");
        const constant = written.constant || assertion === "const";
        const value = unwrapped(expression);
        if (value === null || seen.has(value)) return failing("isn't a value the build can read");
        seen.add(value);
        const each = async (items: readonly Written[]): Promise<Unreadonly | null> => {
            for (const item of items) {
                const found = await unreadonly(item, seen);
                if (found !== null) return found;
            }
            return null;
        };
        switch (value.type) {
            case "Literal": return null;
            case "TemplateLiteral": return value.expressions.length === 0 ? null : failing("isn't a literal");
            case "UnaryExpression":
                return value.operator === "-" && (value.argument.type === "Literal" || (value.argument.type === "Identifier" && (value.argument.name === "Infinity" || value.argument.name === "NaN"))) ? null : failing("isn't a literal");
            case "ArrayExpression": {
                if (!constant) return failing("isn't under `as const`");
                const items: Written[] = [];
                for (const element of value.elements) {
                    if (element === null || element.type === "SpreadElement") return failing("spreads or skips items, which the build can't see are readonly");
                    items.push({ expression: element, module: at, constant });
                }
                return await each(items);
            }
            case "ObjectExpression": {
                if (!constant) return failing("isn't under `as const`");
                const fields: Written[] = [];
                for (const property of value.properties) {
                    if (property.type === "SpreadElement" || property.computed) return failing("spreads or computes a field, which the build can't see is readonly");
                    fields.push({ expression: property.value, module: at, constant });
                }
                return await each(fields);
            }
            case "CallExpression": {
                const path = value.callee.type === "Super" ? null : pathOf(value.callee);
                const returned = path === null ? null : await converter.returnTypeNamed(path, at);
                if (returned === null) return failing("calls a function the build can't find");
                if (returned === undefined) return failing("returns a type the build can't see is readonly: annotate its return type");
                return await readonlyType(returned.type, returned.module, seen) ? null : failing("returns a type that isn't readonly");
            }
            case "Identifier": case "MemberExpression": {
                if (value.type === "Identifier" && (value.name === "Infinity" || value.name === "NaN" || value.name === "undefined")) return null;
                const path = pathOf(value);
                const found = path === null ? null : await converter.constantNamed(path, at);
                if (found === null || found.declaration.init === null) return failing("names a value the build can't read");
                const declared = found.declaration.id.type === "Identifier" ? found.declaration.id.typeAnnotation?.typeAnnotation : undefined;
                return await unreadonly({ expression: found.declaration.init, module: found.module, constant: false, annotation: declared }, seen);
            }
            default: return failing("isn't a literal, `as const` data, a constant typed readonly or a call returning a readonly type");
        }
    };

    /** The value a module writes, when it's data the build reads: literals, and arrays and objects of them, through constants; else undefined. */
    const staticValue = async (written: Written, seen: Set<object>): Promise<Value | undefined> => {
        const value = unwrapped(written.expression);
        if (value === null || seen.has(value)) return undefined;
        seen.add(value);
        const at = written.module;
        switch (value.type) {
            case "Literal": return typeof value.value === "string" || typeof value.value === "number" || typeof value.value === "boolean" || value.value === null ? value.value : undefined;
            case "UnaryExpression":
                if (value.operator !== "-") return undefined;
                if (value.argument.type === "Identifier" && (value.argument.name === "Infinity" || value.argument.name === "NaN")) return -(value.argument.name === "Infinity" ? Infinity : NaN);
                return value.argument.type === "Literal" && typeof value.argument.value === "number" ? -value.argument.value : undefined;
            case "ArrayExpression": {
                const items: Value[] = [];
                for (const element of value.elements) {
                    const item = element === null || element.type === "SpreadElement" ? undefined : await staticValue({ expression: element, module: at, constant: written.constant }, seen);
                    if (item === undefined) return undefined;
                    items.push(item);
                }
                return items;
            }
            case "ObjectExpression": {
                const fields: { [field: string]: Value } = {};
                for (const property of value.properties) {
                    if (property.type === "SpreadElement" || property.computed || property.key.type !== "Identifier") return undefined;
                    const field = await staticValue({ expression: property.value, module: at, constant: written.constant }, seen);
                    if (field === undefined) return undefined;
                    fields[property.key.name] = field;
                }
                return fields;
            }
            case "Identifier": case "MemberExpression": {
                if (value.type === "Identifier" && (value.name === "Infinity" || value.name === "NaN")) return value.name === "Infinity" ? Infinity : NaN;
                const path = pathOf(value);
                const found = path === null ? null : await converter.constantNamed(path, at);
                return found === null || found.declaration.init === null ? undefined : await staticValue({ expression: found.declaration.init, module: found.module, constant: false }, seen);
            }
            default: return undefined;
        }
    };

    /**
     * A declaration's type's namespace's default, `T.default`, as code reading it, and the local binding it reads; null
     * without one. Checked against `schema` when the build can read it. `oneObject` is for a start a joined thread
     * knows by identity, which is read, never copied.
     */
    const namespacedDefault = async (type: TypeNode, name: string, schema: Schema | undefined, oneObject: boolean): Promise<{ readonly text: string; readonly value?: Value; readonly local?: string; readonly packaged: boolean } | null> => {
        const inner = type.type === "TSParenthesizedType" ? type.typeAnnotation : type;
        if (inner.type !== "TSTypeReference" || inner.typeArguments !== null) return null;
        const path = typeNameParts(inner.typeName);
        const [first] = path;
        const written = first === undefined ? null : await defaultWritten(path);
        if (first === undefined || written === null) return null;
        // The package's own types' defaults are their zero values and identities, which a reduction's identity outranks.
        const packaged = host.packagePath(written.module.file) !== null;
        const mutable = await unreadonly(written, new Set());
        if (mutable !== null) {
            fail(mutable.module, mutable.expression, `${path.join(".")}.default is shared by every row and world that starts from it, so it's deeply readonly, but ${mutable.why}. Readonly values are \`const ${path.at(-1) ?? "T"} = { default: ... } as const\`, consts typed readonly (ReadonlyMap, ReadonlySet, Readonly<...>, readonly arrays and fields), and calls of functions whose declared return type is readonly`);
        }
        const value = await staticValue(written, new Set());
        if (schema !== undefined && value !== undefined && !matchesSchema(schema, value)) fail(written.module, written.expression, `${path.join(".")}.default, ${codeOf(value)}, isn't one of its type's values`);
        const imported = module.imports.get(first);
        if (imported !== undefined && !imported.value) {
            // Imported as a type alone, the namespace can't be read here, so a default the build can read is written in.
            if (value === undefined || (oneObject && typeof value === "object" && value !== null)) {
                fail(module, inner, `${name}'s type ${path.join(".")} starts at ${path.join(".")}.default${oneObject ? ", one object a joined thread knows by identity" : ""}: import ${first} as a value, which the registration reads`);
            }
            return { text: codeOf(value ?? null), value: value ?? null, packaged };
        }
        return { text: `${path.join(".")}.default`, local: imported === undefined ? first : undefined, packaged };
    };

    /**
     * A start as code, the local bindings it reads, whether a namespace or an identity gave it, not zero values alone,
     * and its value when it's data the build wrote in.
     */
    type Started = { readonly text: string; readonly locals: readonly string[]; readonly given: boolean; readonly value?: Value };

    /**
     * What a value of `type`, of `schema`, starts at as code: its namespace's default of yours; else for a reduction by
     * `operator`, its identity when that's one of its values; else the package's namespace's; else each field of a
     * struct and item of a tuple by these rules; else its zero value, as `zeroOf` says.
     */
    const startOf = async (type: TypeNode, schema: Schema, operator: unknown, oneObject: boolean): Promise<Started | { readonly fresh: "Map" | "Set" } | { readonly none: string }> => {
        const unwrapped = type.type === "TSParenthesizedType" ? type.typeAnnotation : type;
        const inner = unwrapped.type === "TSTypeOperator" && unwrapped.operator === "readonly" && unwrapped.typeAnnotation !== undefined ? unwrapped.typeAnnotation : unwrapped;
        const namespaced = await namespacedDefault(inner, "it", schema, oneObject);
        const named = namespaced === null ? null : { text: namespaced.text, value: namespaced.value, locals: namespaced.local === undefined ? [] : [namespaced.local], given: true };
        if (named !== null && namespaced !== null && !namespaced.packaged) return named;
        const parts = inner.type === "TSTypeLiteral" && "type" in schema && schema.type === "object"
            ? inner.members.flatMap(field => field.type === "TSPropertySignature" && !field.computed && field.key.type === "Identifier" && field.typeAnnotation !== null
                ? [{ name: field.key.name, type: field.typeAnnotation.typeAnnotation, schema: schema.properties[field.key.name] }] : [])
            : inner.type === "TSTupleType" && "type" in schema && schema.type === "array"
                ? inner.elementTypes.flatMap((element, k) => element.type === "TSOptionalType" || element.type === "TSRestType" || element.type === "TSNamedTupleMember" ? [] : [{ name: String(k), type: element, schema: schema.items }])
                : null;
        if (parts === null || parts.length === 0) {
            const identity = operator === null ? null : identityOf(schema, operator);
            if (identity !== null && matchesSchema(schema, identity)) return { text: codeOf(identity), value: identity, locals: [], given: true };
            if (named !== null) return named;
            const zero = zeroOf(schema);
            return "value" in zero ? { text: codeOf(zero.value), value: zero.value, locals: [], given: false } : zero;
        }
        const texts: string[] = [];
        const locals: string[] = [];
        const values: Value[] = [];
        const fields: { [field: string]: Value } = {};
        let given = false;
        let data = true;
        for (const part of parts) {
            const started = part.schema === undefined ? { none: "it isn't a property" } : await startOf(part.type, part.schema, operator, false);
            if (!("text" in started)) return { none: `its ${inner.type === "TSTupleType" ? "item" : "field"} ${part.name} starts at nothing: ${"fresh" in started ? "a set or a map in a struct has no zero value" : started.none}` };
            texts.push(inner.type === "TSTupleType" ? started.text : `${JSON.stringify(part.name)}: ${started.text}`);
            locals.push(...started.locals);
            given ||= started.given;
            if (started.value === undefined) data = false;
            else {
                values.push(started.value);
                fields[part.name] = started.value;
            }
        }
        // With zero values alone, the schema's zero value says the same, as data.
        if (!given) {
            const zero = zeroOf(schema);
            if ("value" in zero) return { text: codeOf(zero.value), value: zero.value, locals, given };
        }
        if (data) {
            const value = inner.type === "TSTupleType" ? values : fields;
            return { text: codeOf(value), value, locals, given };
        }
        return { text: inner.type === "TSTupleType" ? `[${texts.join(", ")}]` : `{ ${texts.join(", ")} }`, locals, given };
    };

    /** A declared default: a literal type, never `typeof` a value. */
    const literalDefault = async (type: TypeNode, name: string): Promise<Value> => {
        if (type.type === "TSTypeQuery") fail(module, type, `${name}'s default is a literal type, never \`typeof\` a value: without one, it starts at its type's namespace's \`default\`, its reduction's identity, null, or its type's zero value`);
        return await converter.valueOfType(type, module, new Set());
    };

    /** How to give a type's values a start no zero value gives: a literal, or its type's namespace's `default`. */
    const workaround = (type: TypeNode): string => {
        const name = type.type === "TSTypeReference" && type.typeArguments === null ? typeNameParts(type.typeName).join(".") : null;
        return name === null
            ? "declare `default:` as a literal, or name its type and give the type a namespace with a `default`: `type Start = ...; const Start = { default: ... }`"
            : `declare \`default:\` as a literal, or give ${name} a namespace with a \`default\`: \`const ${name} = { default: ... }\``;
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
                // Without a literal, only resources and derived components need a start of their own, and a component
                // holding an object, whose start a joined thread knows by identity.
                const needed = kind === "resource" || builtIns.has("derived");
                const oneObject = kind === "component" && (schema === undefined || !isStruct(schema));
                const reduced = builtIns.get("reduce");
                const operator: unknown = kind === "resource" && reduced !== undefined ? JSON.parse(reduced.text) : null;
                const read = (found: Started): void => {
                    start = found.text;
                    for (const local of found.locals) at = Math.max(at, endOfLocal(local));
                };
                if (given === undefined && (needed || oneObject)) {
                    if (schema === undefined) {
                        const namespaced = await namespacedDefault(typeNode, key.name, undefined, oneObject);
                        if (namespaced !== null) read({ text: namespaced.text, locals: namespaced.local === undefined ? [] : [namespaced.local], given: true });
                        else if (needed && !await allowsNullType(typeNode, module, new Set())) {
                            fail(module, member, `${kind} ${key.name} holds a value that isn't data, so nothing gives it a start: let its type allow null, or give its type a namespace with a deeply readonly \`default\`; a ReadonlyMap or ReadonlySet starts fresh in each world, a Map or Set doesn't`);
                        }
                    }
                    else {
                        const found = await startOf(typeNode, schema, operator, oneObject);
                        if ("text" in found && found.given) read(found);
                        // Else it starts at null, as the world reads a value with neither, when its type allows it.
                        else if (needed && !allowsNullSchema(schema)) {
                            if ("fresh" in found) fresh = found.fresh;
                            else if ("none" in found) fail(module, member, `${kind} ${key.name} starts at no value its type gives, since ${found.none}; ${workaround(typeNode)}`);
                            // A constant is the one value it can start at, which the world reads from its schema.
                            else if (!("const" in schema)) read(found);
                        }
                    }
                }
                const parts = schema === undefined ? [] : [`type: ${codeOf(schema)}`];
                if (start !== undefined) parts.push(`default: ${start}`);
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
