// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { parseAst } from 'vite';
import { Entity } from '../../interface/entity/entity.js';
import * as math from '../../interface/math/index.js';
import type { Schema } from '../../interface/schema/schema.js';
import type { Failure } from './failure.js';
import { insertInto, type SourceMap } from './source-map.js';

/** A TypeScript module's syntax, types included. */
export type TypedProgram = ReturnType<typeof parseAst>;
type Statement = TypedProgram["body"][number];
type Alias = Extract<Statement, { readonly type: "TSTypeAliasDeclaration" }>;
type Interface = Extract<Statement, { readonly type: "TSInterfaceDeclaration" }>;
type Import = Extract<Statement, { readonly type: "ImportDeclaration" }>;
type Declarator = Extract<Statement, { readonly type: "VariableDeclaration" }>["declarations"][number];
type TypeNode = Alias["typeAnnotation"];
type Member = Interface["body"]["body"][number];
type Named = Extract<TypeNode, { readonly type: "TSTypeReference" }>["typeName"];
/** Any node of a module, by the fields this pass reads. */
type Node = { readonly type: string; readonly start: number; readonly end: number };

/** Parses a TypeScript module, types included. */
export type ParseTyped = (code: string, file: string) => TypedProgram;
/** The file an import specifier resolves to from `importer`, or null when it's none this pass can read. */
export type ResolveFile = (specifier: string, importer: string) => Promise<string | null>;
/** A file's code. */
export type LoadFile = (file: string) => Promise<string>;
/** Whether an import specifier, resolved from `importer`, is one of the package's public modules. */
export type IsPackage = (specifier: string, importer: string) => Promise<boolean>;
/** Whether an import specifier, resolved from `importer`, is a module of the package exporting `System`. */
export type IsSystem = (specifier: string, importer: string) => Promise<boolean>;

export type InputHost = { readonly parse: ParseTyped; readonly resolve: ResolveFile; readonly load: LoadFile; readonly isPackage: IsPackage; readonly isSystem: IsSystem };

/** Code with each system's input schema passed to its `create`, the files whose types it read, or why it failed. */
export type InputResult =
    | { readonly code: string; readonly map: SourceMap; readonly dependencies: readonly string[] }
    | { readonly failure: Failure; readonly dependencies: readonly string[] };

/** Thrown inside the pass, and returned as its failure. */
type Thrown = { readonly inputFailure: Failure };
const isThrown = (value: unknown): value is Thrown => typeof value === "object" && value !== null && "inputFailure" in value;

/** A value of any type: a global class, such as the platform's, or `unknown`. */
const anything: Schema = { allOf: [] };

const supported = "a type literal, an alias or interface of one, `number`, `string`, `boolean`, `null`, a literal, a union, an array, a tuple of one type, `ReadonlySet`, `ReadonlyMap`, the values of an `as const` object, the package's `Entity` and math types, a global class or `unknown`";

/** The schema of the package's type at `path`, such as `["Vec2", "I32"]`: its namespace's `schema`. */
const packageSchema = (path: readonly string[]): Schema | undefined => {
    const [first, ...rest] = path;
    let value: unknown = first === "Entity" ? Entity : first === undefined ? undefined : Reflect.get(math, first);
    for (const name of rest) value = typeof value === "object" && value !== null ? Reflect.get(value, name) : undefined;
    const schema: unknown = typeof value === "object" && value !== null ? Reflect.get(value, "schema") : undefined;
    return isSchema(schema) ? schema : undefined;
};

// The package's own schemas are its exported constants.
const isSchema = (value: unknown): value is Schema => typeof value === "object" && value !== null;

/** A parsed module: its declarations of types and its top-level constants by name, and its imports by local name. */
type Module = {
    readonly file: string;
    readonly code: string;
    readonly types: ReadonlyMap<string, Alias | Interface>;
    readonly constants: ReadonlyMap<string, Declarator>;
    readonly imports: ReadonlyMap<string, { readonly source: string; readonly imported: string | null }>;
    readonly exports: readonly Statement[];
};

const declarationOf = (statement: Statement): Alias | Interface | null => {
    const declared = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    return declared?.type === "TSTypeAliasDeclaration" || declared?.type === "TSInterfaceDeclaration" ? declared : null;
};

/** The top-level constants a statement declares. */
const constantsOf = (statement: Statement): readonly Declarator[] => {
    const declared = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    return declared?.type === "VariableDeclaration" && declared.kind === "const" ? declared.declarations.filter(declarator => declarator.id.type === "Identifier") : [];
};

const nameOfDeclarator = (declarator: Declarator): string => declarator.id.type === "Identifier" ? declarator.id.name : "";

const importsOf = (statement: Import): [string, { readonly source: string; readonly imported: string | null }][] =>
    statement.specifiers.map(specifier => [specifier.local.name, {
        source: statement.source.value,
        // A namespace import names the module itself.
        imported: specifier.type === "ImportSpecifier" ? (specifier.imported.type === "Identifier" ? specifier.imported.name : specifier.imported.value)
            : specifier.type === "ImportDefaultSpecifier" ? "default" : null,
    }]);

const moduleOf = (file: string, code: string, program: TypedProgram): Module => {
    const types = new Map<string, Alias | Interface>();
    const constants = new Map<string, Declarator>();
    const imports = new Map<string, { readonly source: string; readonly imported: string | null }>();
    for (const statement of program.body) {
        const declared = declarationOf(statement);
        if (declared !== null) types.set(declared.id.name, declared);
        for (const declarator of constantsOf(statement)) constants.set(nameOfDeclarator(declarator), declarator);
        if (statement.type === "ImportDeclaration") for (const [local, entry] of importsOf(statement)) imports.set(local, entry);
    }
    return { file, code, types, constants, imports, exports: program.body.filter(statement => statement.type === "ExportNamedDeclaration" || statement.type === "ExportAllDeclaration") };
};

/** The line and column of an offset, 1-based line, 0-based column, as a failure's position. */
const positionOf = (code: string, offset: number): { readonly line: number; readonly column: number } => {
    const before = code.slice(0, offset);
    const line = before.split("\n").length;
    return { line, column: offset - (before.lastIndexOf("\n") + 1) };
};

/** The module being transformed, and where in it the parameter whose type is being converted is. */
type Site = { readonly root: string; at: number };

/** Fails at `node`, or for a type of another module at the parameter, with a frame naming where in that module. */
const failAt = (site: Site, module: Module, node: Node, message: string): never => {
    const { line, column } = positionOf(module.code, node.start);
    const inRoot = module.file === site.root;
    const thrown: Thrown = { inputFailure: { message, position: inRoot ? node.start : site.at, frames: inRoot ? [] : [{ name: "input type", file: module.file, line, column }] } };
    throw thrown;
};

/** Converts input types to schemas, reading the modules they're declared in through `host`. */
const createConverter = (host: InputHost, root: string) => {
    const site: Site = { root, at: 0 };
    const fail = (module: Module, node: Node, message: string): never => failAt(site, module, node, message);
    const modules = new Map<string, Promise<Module | null>>();
    const read = new Set<string>();
    const load = (file: string): Promise<Module | null> => {
        const found = modules.get(file);
        if (found !== undefined) return found;
        const loading = (async () => {
            read.add(file);
            const code = await host.load(file);
            return moduleOf(file, code, host.parse(code, file));
        })();
        modules.set(file, loading);
        return loading;
    };

    /**
     * What `name` names in `module`'s exports, of `kind`, following re-exports: a type's declaration, or a constant's
     * declarator; null when it exports none by that name.
     */
    const exported = async <T>(module: Module, name: string, kind: (module: Module) => ReadonlyMap<string, T>, seen: Set<string>): Promise<{ readonly module: Module; readonly declaration: T } | "package" | null> => {
        const key = `${module.file}#${name}`;
        if (seen.has(key)) return null;
        seen.add(key);
        // A module's own declaration comes before what it re-exports.
        const own = kind(module).get(name);
        if (own !== undefined) return { module, declaration: own };
        for (const statement of module.exports) {
            if (statement.type === "ExportNamedDeclaration") {
                for (const specifier of statement.specifiers) {
                    const exportedName = specifier.exported.type === "Identifier" ? specifier.exported.name : specifier.exported.value;
                    if (exportedName !== name) continue;
                    const localName = specifier.local.type === "Identifier" ? specifier.local.name : specifier.local.value;
                    if (statement.source !== null) return await fromSource(module, statement.source.value, localName, kind, seen);
                    const local = kind(module).get(localName);
                    if (local !== undefined) return { module, declaration: local };
                    const imported = module.imports.get(localName);
                    if (imported !== undefined && imported.imported !== null) return await fromSource(module, imported.source, imported.imported, kind, seen);
                }
            }
            else if (statement.type === "ExportAllDeclaration" && statement.exported === null) {
                const found = await fromSource(module, statement.source.value, name, kind, seen);
                if (found !== null) return found;
            }
        }
        return null;
    };

    const fromSource = async <T>(module: Module, source: string, name: string, kind: (module: Module) => ReadonlyMap<string, T>, seen: Set<string>): Promise<{ readonly module: Module; readonly declaration: T } | "package" | null> => {
        if (await host.isPackage(source, module.file)) return "package";
        const file = await host.resolve(source, module.file);
        if (file === null) return null;
        const target = await load(file);
        return target === null ? null : await exported(target, name, kind, seen);
    };
    const typesOf = (module: Module): ReadonlyMap<string, Alias | Interface> => module.types;
    const constantsIn = (module: Module): ReadonlyMap<string, Declarator> => module.constants;

    const nameParts = (name: Named): readonly string[] =>
        name.type === "Identifier" ? [name.name] : name.type === "TSQualifiedName" ? [...nameParts(name.left), name.right.name] : [];

    /** The schema of a type, read in `module`; `active` holds the declarations being converted, so recursion fails. */
    const convert = async (type: TypeNode, module: Module, active: ReadonlySet<Alias | Interface>): Promise<Schema> => {
        switch (type.type) {
            case "TSNumberKeyword": return { type: "number" };
            case "TSStringKeyword": return { type: "string" };
            case "TSBooleanKeyword": return { type: "boolean" };
            case "TSNullKeyword": return { type: "null" };
            case "TSUnknownKeyword": return anything;
            case "TSParenthesizedType": return await convert(type.typeAnnotation, module, active);
            case "TSTypeOperator":
                return type.operator === "readonly" ? await convert(type.typeAnnotation, module, active) : fail(module, type, `\`${type.operator}\` isn't an input type: an input is ${supported}`);
            case "TSLiteralType": {
                const { literal } = type;
                if (literal.type === "Literal" && (typeof literal.value === "string" || typeof literal.value === "number" || typeof literal.value === "boolean")) return { const: literal.value };
                if (literal.type === "UnaryExpression" && literal.operator === "-" && literal.argument.type === "Literal" && typeof literal.argument.value === "number") return { const: -literal.argument.value };
                return fail(module, type, "an input's literal type is a string, number or boolean");
            }
            case "TSUnionType": {
                const types = type.types.filter(member => member.type !== "TSUndefinedKeyword");
                if (types.length !== type.types.length) return fail(module, type, "an input field that may be missing is optional (`field?:`) rather than `| undefined`");
                const schemas = await Promise.all(types.map(member => convert(member, module, active)));
                return { anyOf: schemas };
            }
            case "TSArrayType": return { type: "array", items: await convert(type.elementType, module, active) };
            case "TSTupleType": {
                const elements = type.elementTypes;
                const first = elements[0];
                if (first === undefined) return fail(module, type, "an input's tuple has elements");
                const schemas = await Promise.all(elements.map(element => element.type === "TSOptionalType" || element.type === "TSRestType" || element.type === "TSNamedTupleMember"
                    ? fail(module, element, "an input's tuple has a fixed length, and its elements no names") : convert(element, module, active)));
                const items = schemas[0];
                if (items === undefined || schemas.some(schema => JSON.stringify(schema) !== JSON.stringify(items))) return fail(module, type, "an input's tuple has elements of one type");
                return { type: "array", items, minItems: elements.length, maxItems: elements.length };
            }
            case "TSTypeLiteral": return await objectOf(type.members, [], module, active, type);
            case "TSIntersectionType": {
                const parts = await Promise.all(type.types.map(member => convert(member, module, active)));
                const properties: { [field: string]: Schema } = {};
                const required: string[] = [];
                let optional = false;
                for (const part of parts) {
                    if (!("type" in part) || part.type !== "object") return fail(module, type, "an input's intersection joins object types");
                    for (const [field, schema] of Object.entries(part.properties)) properties[field] = schema;
                    if (part.required === undefined) required.push(...Object.keys(part.properties));
                    else {
                        optional = true;
                        required.push(...part.required);
                    }
                }
                return optional ? { type: "object", properties, required } : { type: "object", properties };
            }
            case "TSTypeReference": return await referenced(type, module, active);
            case "TSIndexedAccessType": return await valuesOf(type, module);
            default: return fail(module, type, `an input is ${supported}`);
        }
    };

    const objectOf = async (members: readonly Member[], inherited: readonly Schema[], module: Module, active: ReadonlySet<Alias | Interface>, at: Node): Promise<Schema> => {
        const properties: { [field: string]: Schema } = {};
        const required: string[] = [];
        let optional = false;
        for (const schema of inherited) {
            if (!("type" in schema) || schema.type !== "object") return fail(module, at, "an input interface extends object types");
            for (const [field, property] of Object.entries(schema.properties)) properties[field] = property;
            if (schema.required === undefined) required.push(...Object.keys(schema.properties));
            else {
                optional = true;
                required.push(...schema.required);
            }
        }
        for (const member of members) {
            if (member.type !== "TSPropertySignature" || member.computed) return fail(module, member, "an input's fields are named properties");
            const { key } = member;
            const field = key.type === "Identifier" ? key.name : key.type === "Literal" && typeof key.value === "string" ? key.value : fail(module, member, "an input's fields are named properties");
            if (member.typeAnnotation === null) return fail(module, member, `input field "${field}" has a type`);
            properties[field] = await convert(member.typeAnnotation.typeAnnotation, module, active);
            if (member.optional) optional = true;
            else required.push(field);
        }
        return optional ? { type: "object", properties, required } : { type: "object", properties };
    };

    const declared = async (declaration: Alias | Interface, module: Module, active: ReadonlySet<Alias | Interface>, at: Node): Promise<Schema> => {
        if (active.has(declaration)) return fail(module, at, `input type ${declaration.id.name} refers to itself`);
        if (declaration.typeParameters !== null) return fail(module, at, `input type ${declaration.id.name} is generic, which an input type isn't`);
        const inner = new Set(active).add(declaration);
        if (declaration.type === "TSTypeAliasDeclaration") return await convert(declaration.typeAnnotation, module, inner);
        const inherited = await Promise.all(declaration.extends.map(async heritage => {
            const { expression } = heritage;
            if (expression.type !== "Identifier" || heritage.typeArguments !== null) return fail(module, heritage, "an input interface extends named, non-generic types");
            return await named([expression.name], module, inner, heritage);
        }));
        return await objectOf(declaration.body.body, inherited, module, inner, declaration);
    };

    /** The schema of the type `path` names in `module`. */
    const named = async (path: readonly string[], module: Module, active: ReadonlySet<Alias | Interface>, at: Node): Promise<Schema> => {
        const [first, ...rest] = path;
        if (first === undefined) return fail(module, at, `an input is ${supported}`);
        const local = module.types.get(first);
        if (local !== undefined && rest.length === 0) return await declared(local, module, active, at);
        const imported = module.imports.get(first);
        if (imported !== undefined) {
            if (await host.isPackage(imported.source, module.file)) {
                const schema = packageSchema(imported.imported === null ? rest : [imported.imported, ...rest]);
                return schema ?? fail(module, at, `${path.join(".")} is no type of the package an input can take: it takes Entity and the math types`);
            }
            if (imported.imported === null || rest.length > 0) return fail(module, at, `input type ${path.join(".")} is read through a namespace, which this pass doesn't follow; import it by name`);
            const found = await fromSource(module, imported.source, imported.imported, typesOf, new Set());
            if (found === "package") {
                return packageSchema([imported.imported]) ?? fail(module, at, `${imported.imported} is no type of the package an input can take: it takes Entity and the math types`);
            }
            if (found === null) return fail(module, at, `input type ${first} isn't a type alias or interface its module exports, which this pass can read`);
            return await declared(found.declaration, found.module, active, at);
        }
        // Neither declared nor imported, it's a global, which TypeScript checked exists: a class, such as the platform's.
        return anything;
    };

    const referenced = async (type: Extract<TypeNode, { readonly type: "TSTypeReference" }>, module: Module, active: ReadonlySet<Alias | Interface>): Promise<Schema> => {
        const path = nameParts(type.typeName);
        const parameters = type.typeArguments?.params ?? [];
        const [only] = path;
        if (path.length === 1 && only !== undefined && !module.types.has(only) && !module.imports.has(only)) {
            const [first, second] = parameters;
            if ((only === "ReadonlyArray" || only === "Array") && parameters.length === 1 && first !== undefined) return { type: "array", items: await convert(first, module, active) };
            if ((only === "ReadonlySet" || only === "Set") && parameters.length === 1 && first !== undefined) return { type: "set", items: await convert(first, module, active) };
            if ((only === "ReadonlyMap" || only === "Map") && parameters.length === 2 && first !== undefined && second !== undefined) {
                return { type: "map", keys: await convert(first, module, active), values: await convert(second, module, active) };
            }
        }
        if (parameters.length > 0) return fail(module, type, `input type ${path.join(".")} takes type arguments, which an input type doesn't`);
        return await named(path, module, active, type);
    };

    /** `(typeof X)[keyof typeof X]`: the values of the `as const` object `X`, as a union of their literals. */
    const valuesOf = async (type: Extract<TypeNode, { readonly type: "TSIndexedAccessType" }>, module: Module): Promise<Schema> => {
        const queried = (node: TypeNode): string | null => {
            const inner = node.type === "TSParenthesizedType" ? node.typeAnnotation : node;
            return inner.type === "TSTypeQuery" && inner.typeArguments === null && inner.exprName.type === "Identifier" ? inner.exprName.name : null;
        };
        const name = queried(type.objectType);
        const index = type.indexType.type === "TSTypeOperator" && type.indexType.operator === "keyof" ? queried(type.indexType.typeAnnotation) : null;
        if (name === null || index !== name) return fail(module, type, `an input's indexed access type is \`(typeof X)[keyof typeof X]\`, the values of an \`as const\` object`);
        const imported = module.imports.get(name);
        const local = module.constants.get(name);
        const found = local !== undefined ? { module, declaration: local }
            : imported !== undefined && imported.imported !== null ? await fromSource(module, imported.source, imported.imported, constantsIn, new Set()) : null;
        if (found === null || found === "package") return fail(module, type, `${name} isn't a constant its module declares or exports, which this pass can read`);
        const { declaration } = found;
        let init = declaration.init;
        let constant = false;
        while (init !== null && (init.type === "TSAsExpression" || init.type === "TSSatisfiesExpression" || init.type === "ParenthesizedExpression")) {
            if (init.type === "TSAsExpression" && init.typeAnnotation.type === "TSTypeReference" && init.typeAnnotation.typeName.type === "Identifier" && init.typeAnnotation.typeName.name === "const") constant = true;
            init = init.expression;
        }
        if (init === null || init.type !== "ObjectExpression" || !constant) return fail(found.module, declaration, `${name} is an object declared \`as const\`, whose values are literals`);
        const values: (string | number | boolean)[] = [];
        for (const property of init.properties) {
            const value = property.type === "Property" ? property.value : null;
            const literal = value?.type === "Literal" && (typeof value.value === "string" || typeof value.value === "number" || typeof value.value === "boolean") ? value.value
                : value?.type === "UnaryExpression" && value.operator === "-" && value.argument.type === "Literal" && typeof value.argument.value === "number" ? -value.argument.value
                : undefined;
            if (literal === undefined) return fail(found.module, property, `${name}'s values are string, number or boolean literals`);
            if (!values.includes(literal)) values.push(literal);
        }
        return { anyOf: values.map(value => ({ const: value })) };
    };

    return { convert, moduleOf, read, site, fail };
};

type Expression = Extract<Statement, { readonly type: "ExpressionStatement" }>["expression"];
type Call = Extract<Expression, { readonly type: "CallExpression" }>;
type FunctionNode = Extract<Expression, { readonly type: "ArrowFunctionExpression" | "FunctionExpression" }>;

/** Every node under `node`, in source order. */
const each = (node: unknown, visit: (node: Node) => void): void => {
    if (Array.isArray(node)) {
        for (const item of node) each(item, visit);
        return;
    }
    if (typeof node !== "object" || node === null || typeof Reflect.get(node, "type") !== "string") return;
    if (isNode(node)) visit(node);
    for (const key of Object.keys(node)) if (key !== "parent") each(Reflect.get(node, key), visit);
};

const isNode = (value: object): value is Node => typeof Reflect.get(value, "start") === "number" && typeof Reflect.get(value, "end") === "number";

// Each call's arguments are its own expressions.
const isCall = (node: Node): node is Call => node.type === "CallExpression";

const unwrapped = (node: Call["arguments"][number]): Call["arguments"][number] =>
    node.type === "ParenthesizedExpression" ? unwrapped(node.expression) : node;

const isFunction = (node: Call["arguments"][number]): node is FunctionNode => node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression";

/** Whether a declaration written in place declares `components`; null when it isn't written in place. */
const declaresComponents = (declaration: Call["arguments"][number]): boolean | null => {
    if (declaration.type !== "ObjectExpression") return null;
    return declaration.properties.some(property => property.type === "Property" && !property.computed
        && ((property.key.type === "Identifier" && property.key.name === "components") || (property.key.type === "Literal" && property.key.value === "components")));
};

/**
 * Passes each `System.create(declaration, body)` the schema of its body's input, the type of its parameter after its
 * context, as a third argument: `create` takes the schema from there. The type is read from its syntax, through aliases
 * and interfaces of the module and those it imports, so it needs no type checker. Returns null when no system here
 * takes input.
 */
export const passInputSchemas = async (code: string, file: string, host: InputHost): Promise<InputResult | null> => {
    if (!code.includes("System") || !code.includes(".create(")) return null;
    const converter = createConverter(host, file);
    const { fail } = converter;
    const program = host.parse(code, file);
    const module = moduleOf(file, code, program);
    const systems = new Set<string>();
    for (const [local, entry] of module.imports) {
        if (entry.imported === "System" && await host.isSystem(entry.source, file)) systems.add(local);
    }
    if (systems.size === 0) return null;
    const calls: Call[] = [];
    each(program.body, node => {
        if (!isCall(node)) return;
        const { callee } = node;
        if (callee.type === "MemberExpression" && !callee.computed && callee.object.type === "Identifier" && systems.has(callee.object.name)
            && callee.property.type === "Identifier" && callee.property.name === "create" && node.arguments.length === 2) calls.push(node);
    });
    const insertions: { readonly at: number; readonly text: string }[] = [];
    try {
        for (const call of calls) {
            const [declaration, second] = call.arguments;
            if (declaration === undefined || second === undefined) continue;
            const body = unwrapped(second);
            if (!isFunction(body)) continue;
            const components = declaresComponents(declaration);
            // For a declaration not written in place, a third parameter is the input, as is a second one with a type: a
            // context is rarely given one.
            const before = components === null ? (body.params.length > 2 || annotationOf(body.params[1]) === null ? 2 : 1) : components ? 2 : 1;
            const parameter = body.params[before];
            if (parameter === undefined) continue;
            if (parameter.type === "RestElement") fail(module, parameter, "a body's input is one parameter, not a rest parameter");
            if (parameter.type === "AssignmentPattern") fail(module, parameter, "a body's input has no default");
            const annotation = annotationOf(parameter);
            if (annotation === null) return fail(module, parameter, "a body's input parameter has a type, which its schema is made from");
            converter.site.at = parameter.start;
            const schema = await converter.convert(annotation, module, new Set());
            if (!("type" in schema) || schema.type !== "object") fail(module, parameter, "a body's input is an object of named fields");
            insertions.push({ at: second.end, text: `, ${JSON.stringify(schema)}` });
        }
    } catch (error) {
        if (isThrown(error)) return { failure: error.inputFailure, dependencies: [...converter.read] };
        throw error;
    }
    if (insertions.length === 0) return null;
    return { ...insertInto(code, insertions, file), dependencies: [...converter.read] };
};

type Parameter = FunctionNode["params"][number];

const annotationOf = (parameter: Parameter | undefined): TypeNode | null => {
    if (parameter === undefined || parameter.type === "TSParameterProperty") return null;
    const annotation = parameter.type === "RestElement" ? parameter.typeAnnotation : parameter.typeAnnotation;
    return annotation === null || annotation === undefined ? null : annotation.typeAnnotation;
};
