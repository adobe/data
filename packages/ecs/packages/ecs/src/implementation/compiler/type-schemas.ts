// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { parseAst } from 'vite';
import type { Schema } from '../../interface/schema/schema.js';
import type { Failure } from './failure.js';

/** A TypeScript module's syntax, types included. */
export type TypedProgram = ReturnType<typeof parseAst>;
export type Statement = TypedProgram["body"][number];
type Alias = Extract<Statement, { readonly type: "TSTypeAliasDeclaration" }>;
type Interface = Extract<Statement, { readonly type: "TSInterfaceDeclaration" }>;
type Class = Extract<Statement, { readonly superClass: unknown }>;
type Namespace = Extract<Statement, { readonly type: "TSModuleDeclaration"; readonly global: false }>;
type Import = Extract<Statement, { readonly type: "ImportDeclaration" }>;
type Enum = Extract<Statement, { readonly type: "TSEnumDeclaration" }>;
/** A function a statement declares, by the shape every function shares. */
type FunctionDeclared = Extract<Statement, { readonly params: unknown }>;
export type Declarator = Extract<Statement, { readonly type: "VariableDeclaration" }>["declarations"][number];
export type TypeNode = Alias["typeAnnotation"];
type Member = Interface["body"]["body"][number];
type Named = Extract<TypeNode, { readonly type: "TSTypeReference" }>["typeName"];
type Expression = NonNullable<Declarator["init"]>;
/** Any node of a module, by the fields this pass reads. */
export type Node = { readonly type: string; readonly start: number; readonly end: number };

/** A type's declaration: an alias, an interface or a class. */
type Declared = Alias | Interface | Class;

/** Parses a TypeScript module, types included. */
export type ParseTyped = (code: string, file: string) => TypedProgram;
/** The file an import specifier resolves to from `importer`, or null when it's none this pass can read. */
export type ResolveFile = (specifier: string, importer: string) => Promise<string | null>;
/** A file's code. */
export type LoadFile = (file: string) => Promise<string>;
/**
 * A file's path in a copy of the package, without its extension, as `interface/schema/schema` for both its `src` and
 * its `dist`; null for any other file.
 */
export type PackagePathOf = (file: string) => string | null;

export type TypeHost = { readonly parse: ParseTyped; readonly resolve: ResolveFile; readonly load: LoadFile; readonly packagePath: PackagePathOf };

/** What a type is converted for, which decides how values that aren't data are taken, and how failures read. */
export type Use = "input" | "declaration";

/** Thrown inside a pass, and returned as its failure. */
type Thrown = { readonly typeFailure: Failure };
export const isThrown = (value: unknown): value is Thrown => typeof value === "object" && value !== null && "typeFailure" in value;

/** Thrown, for a declaration, by a type that isn't data; `node` when it's a DOM `Node`, which lives on `"main"`. */
type NotData = { readonly notData: { readonly node: boolean } };
export const isNotData = (value: unknown): value is NotData => typeof value === "object" && value !== null && "notData" in value;

/** A value of any type: a global class, such as the platform's, or `unknown`. */
const anything: Schema = { allOf: [] };

/** Any JSON value, or a set or map's: what a schema type's argument and an `as const` object's values are. */
type Value = string | number | boolean | null | readonly Value[] | { readonly [field: string]: Value };

/** An import's source and the name it imports, null for a whole module, and whether it brings a value. */
type Imported = { readonly source: string; readonly imported: string | null; readonly value: boolean };

/** A parsed module: its declarations by name, and its imports by local name. */
export type Module = {
    readonly file: string;
    readonly code: string;
    readonly program: TypedProgram;
    readonly types: ReadonlyMap<string, Declared>;
    readonly namespaces: ReadonlyMap<string, Namespace>;
    readonly constants: ReadonlyMap<string, Declarator>;
    readonly enums: ReadonlyMap<string, Enum>;
    readonly functions: ReadonlyMap<string, FunctionDeclared>;
    readonly imports: ReadonlyMap<string, Imported>;
    /** The types its `declare global` blocks declare. */
    readonly globals: { readonly types: ReadonlyMap<string, Declared>; readonly enums: ReadonlyMap<string, Enum> };
    readonly exports: readonly Statement[];
};

const declarationOf = (statement: Statement): Declared | Namespace | null => {
    const declared = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    if (declared === null || declared === undefined) return null;
    if (declared.type === "TSModuleDeclaration") return declared.global === false && declared.id.type === "Identifier" ? declared : null;
    return declared.type === "TSTypeAliasDeclaration" || declared.type === "TSInterfaceDeclaration" || declared.type === "ClassDeclaration" ? declared : null;
};

/** The top-level constants a statement declares. */
const constantsOf = (statement: Statement): readonly Declarator[] => {
    const declared = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    return declared?.type === "VariableDeclaration" && declared.kind === "const" ? declared.declarations.filter(declarator => declarator.id.type === "Identifier") : [];
};

export const nameOfDeclarator = (declarator: Declarator): string => declarator.id.type === "Identifier" ? declarator.id.name : "";

const importsOf = (statement: Import): [string, Imported][] =>
    statement.specifiers.map(specifier => [specifier.local.name, {
        source: statement.source.value,
        // A namespace import names the module itself.
        imported: specifier.type === "ImportSpecifier" ? (specifier.imported.type === "Identifier" ? specifier.imported.name : specifier.imported.value)
            : specifier.type === "ImportDefaultSpecifier" ? "default" : null,
        value: statement.importKind !== "type" && !(specifier.type === "ImportSpecifier" && specifier.importKind === "type"),
    }]);

/** The declarations of a module, or of a namespace's block in it. */
const scopeOf = (statements: readonly Statement[]) => {
    const types = new Map<string, Declared>();
    const namespaces = new Map<string, Namespace>();
    const constants = new Map<string, Declarator>();
    const enums = new Map<string, Enum>();
    const functions = new Map<string, FunctionDeclared>();
    for (const statement of statements) {
        const inner = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
        if (inner?.type === "TSEnumDeclaration") enums.set(inner.id.name, inner);
        if (inner?.type === "FunctionDeclaration" && inner.id !== null) functions.set(inner.id.name, inner);
        const declared = declarationOf(statement);
        if (declared?.type === "TSModuleDeclaration") {
            if (declared.id.type === "Identifier") namespaces.set(declared.id.name, declared);
        }
        else if (declared !== null && declared.id !== null) types.set(declared.id.name, declared);
        for (const declarator of constantsOf(statement)) constants.set(nameOfDeclarator(declarator), declarator);
    }
    return { types, namespaces, constants, enums, functions };
};

export const moduleOf = (file: string, code: string, program: TypedProgram): Module => {
    const imports = new Map<string, Imported>();
    for (const statement of program.body) {
        if (statement.type === "ImportDeclaration") for (const [local, entry] of importsOf(statement)) imports.set(local, entry);
    }
    // `declare global` blocks declare types every module names without importing them.
    const globals = scopeOf(program.body.flatMap(statement => statement.type === "TSModuleDeclaration" && statement.global && statement.body !== null ? statement.body.body : []));
    return {
        file, code, program, ...scopeOf(program.body), imports, globals,
        exports: program.body.filter(statement => statement.type === "ExportNamedDeclaration" || statement.type === "ExportAllDeclaration"),
    };
};

/** The line and column of an offset, 1-based line, 0-based column, as a failure's position. */
const positionOf = (code: string, offset: number): { readonly line: number; readonly column: number } => {
    const before = code.slice(0, offset);
    const line = before.split("\n").length;
    return { line, column: offset - (before.lastIndexOf("\n") + 1) };
};

/** The module being transformed, and where in it the type being converted is. */
type Site = { readonly root: string; at: number };

/** A type found by name: where it's declared, and the namespaces it's declared in; an enum; or a global. */
type Found = { readonly module: Module; readonly declaration: Declared; readonly within: readonly string[] } | "enum" | "global";

/** A namespace found by name: a module, or a TypeScript namespace declared in one. */
type FoundNamespace = { readonly module: Module; readonly block: Namespace | null; readonly within: readonly string[] };

/** The DOM's classes of `Node`, which live on `"main"`. */
const domNode = /^(Node|Element|Text|Comment|CharacterData|Document|DocumentFragment|ShadowRoot|Attr|HTML\w*Element|SVG\w*Element|MathMLElement)$/;

const statementsOf = (block: Namespace): readonly Statement[] => block.body?.type === "TSModuleBlock" ? block.body.body : [];

/** Converts types to schemas, reading the modules they're declared in through `host`. */
export const createConverter = (host: TypeHost, root: string) => {
    const site: Site = { root, at: 0 };
    const modules = new Map<string, Promise<Module>>();
    const read = new Set<string>();
    const load = (file: string): Promise<Module> => {
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

    /** Fails at `node`, or for a node of another module at the site, with a frame naming where in that module. */
    const fail = (module: Module, node: Node, message: string): never => {
        const { line, column } = positionOf(module.code, node.start);
        const inRoot = module.file === site.root;
        const thrown: Thrown = { typeFailure: { message, position: inRoot ? node.start : site.at, frames: inRoot ? [] : [{ name: "type", file: module.file, line, column }] } };
        throw thrown;
    };

    const moduleAt = async (module: Module, source: string): Promise<Module | null> => {
        // A specifier the build can't resolve names a module this pass can't read.
        const file = await host.resolve(source, module.file).catch(() => null);
        return file === null ? null : await load(file);
    };

    /** What a module exports as `name`, of `kind`, following re-exports; null when it exports none by that name. */
    const exported = async <T>(module: Module, name: string, kind: (module: Module) => ReadonlyMap<string, T>, seen: Set<string>): Promise<{ readonly module: Module; readonly declaration: T } | null> => {
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
                    const imported = module.imports.get(localName);
                    if (imported !== undefined && imported.imported !== null) return await fromSource(module, imported.source, imported.imported, kind, seen);
                    const local = kind(module).get(localName);
                    if (local !== undefined) return { module, declaration: local };
                }
            }
            else if (statement.type === "ExportAllDeclaration" && statement.exported === null) {
                const found = await fromSource(module, statement.source.value, name, kind, seen);
                if (found !== null) return found;
            }
        }
        return null;
    };

    const fromSource = async <T>(module: Module, source: string, name: string, kind: (module: Module) => ReadonlyMap<string, T>, seen: Set<string>): Promise<{ readonly module: Module; readonly declaration: T } | null> => {
        const target = await moduleAt(module, source);
        return target === null ? null : await exported(target, name, kind, seen);
    };

    /** The namespace a module exports as `name`: a module re-exported whole, or a TypeScript namespace. */
    const exportedNamespace = async (module: Module, name: string, seen: Set<string>): Promise<FoundNamespace | null> => {
        const key = `${module.file}#${name}`;
        if (seen.has(key)) return null;
        seen.add(key);
        const own = module.namespaces.get(name);
        if (own !== undefined) return { module, block: own, within: [name] };
        for (const statement of module.exports) {
            if (statement.type === "ExportAllDeclaration") {
                const exportedName = statement.exported === null ? null : statement.exported.type === "Identifier" ? statement.exported.name : statement.exported.value;
                if (exportedName === name) {
                    const target = await moduleAt(module, statement.source.value);
                    return target === null ? null : { module: target, block: null, within: [] };
                }
                if (exportedName === null) {
                    const target = await moduleAt(module, statement.source.value);
                    const found = target === null ? null : await exportedNamespace(target, name, seen);
                    if (found !== null) return found;
                }
            }
            else if (statement.type === "ExportNamedDeclaration") {
                for (const specifier of statement.specifiers) {
                    const exportedName = specifier.exported.type === "Identifier" ? specifier.exported.name : specifier.exported.value;
                    if (exportedName !== name) continue;
                    const localName = specifier.local.type === "Identifier" ? specifier.local.name : specifier.local.value;
                    if (statement.source !== null) {
                        const target = await moduleAt(module, statement.source.value);
                        return target === null ? null : await exportedNamespace(target, localName, seen);
                    }
                    return await namespaceNamed(module, localName, seen);
                }
            }
        }
        return null;
    };

    /** The namespace `name` names in a module: its own, one it imports whole, or one it imports by name. */
    const namespaceNamed = async (module: Module, name: string, seen: Set<string>): Promise<FoundNamespace | null> => {
        const own = module.namespaces.get(name);
        if (own !== undefined) return { module, block: own, within: [name] };
        const imported = module.imports.get(name);
        if (imported === undefined) return null;
        const target = await moduleAt(module, imported.source);
        if (target === null) return null;
        return imported.imported === null ? { module: target, block: null, within: [] } : await exportedNamespace(target, imported.imported, seen);
    };

    /** A member of a namespace: a nested namespace, a type, or a constant. */
    const memberNamespace = async (found: FoundNamespace, name: string): Promise<FoundNamespace | null> => {
        if (found.block === null) return await exportedNamespace(found.module, name, new Set());
        const nested = scopeOf(statementsOf(found.block)).namespaces.get(name);
        return nested === undefined ? null : { module: found.module, block: nested, within: [...found.within, name] };
    };
    const memberType = async (found: FoundNamespace, name: string): Promise<Found | null> => {
        if (found.block === null) {
            const type = await exported(found.module, name, typesOf, new Set());
            return type === null ? null : { module: type.module, declaration: type.declaration, within: [] };
        }
        const declaration = scopeOf(statementsOf(found.block)).types.get(name);
        return declaration === undefined ? null : { module: found.module, declaration, within: found.within };
    };
    const memberConstant = async (found: FoundNamespace, name: string): Promise<{ readonly module: Module; readonly declaration: Declarator } | null> => {
        if (found.block === null) return await exported(found.module, name, constantsIn, new Set());
        const declaration = scopeOf(statementsOf(found.block)).constants.get(name);
        return declaration === undefined ? null : { module: found.module, declaration };
    };

    const typesOf = (module: Module): ReadonlyMap<string, Declared> => module.types;
    const constantsIn = (module: Module): ReadonlyMap<string, Declarator> => module.constants;

    /** The namespace the leading parts of a path name, then its last part through `member`. */
    const throughNamespaces = async <T>(module: Module, path: readonly string[], member: (found: FoundNamespace, name: string) => Promise<T | null>): Promise<T | null> => {
        const [first, ...rest] = path;
        const last = rest.pop();
        if (first === undefined || last === undefined) return null;
        let found = await namespaceNamed(module, first, new Set());
        for (const name of rest) found = found === null ? null : await memberNamespace(found, name);
        return found === null ? null : await member(found, last);
    };

    /** The type `path` names in `module`: its declaration, or a global when nothing declares or imports it. */
    const typeNamed = async (path: readonly string[], module: Module): Promise<Found | null> => {
        const [first] = path;
        if (first === undefined) return null;
        if (path.length > 1) return await throughNamespaces(module, path, memberType);
        const local = module.types.get(first);
        if (local !== undefined) return { module, declaration: local, within: [] };
        if (module.enums.has(first)) return "enum";
        const imported = module.imports.get(first);
        if (imported === undefined) return await globalNamed(first, module, new Set()) ?? "global";
        if (imported.imported === null) return null;
        const found = await fromSource(module, imported.source, imported.imported, typesOf, new Set());
        if (found !== null) return { module: found.module, declaration: found.declaration, within: [] };
        return await fromSource(module, imported.source, imported.imported, enumsOf, new Set()) === null ? null : "enum";
    };

    /**
     * A type `declare global` declares, in a module or the modules of the application it imports relatively; null
     * where none does. Packages' globals, the platform's among them, are classes.
     */
    const globalNamed = async (name: string, module: Module, seen: Set<string>): Promise<Found | null> => {
        if (seen.has(module.file)) return null;
        seen.add(module.file);
        const declaration = module.globals.types.get(name);
        if (declaration !== undefined) return { module, declaration, within: [] };
        if (module.globals.enums.has(name)) return "enum";
        for (const statement of module.program.body) {
            if (statement.type !== "ImportDeclaration" || !statement.source.value.startsWith(".")) continue;
            const target = await moduleAt(module, statement.source.value);
            const found = target === null || host.packagePath(target.file) !== null ? null : await globalNamed(name, target, seen);
            if (found !== null) return found;
        }
        return null;
    };
    const enumsOf = (module: Module): ReadonlyMap<string, Enum> => module.enums;

    /** The constant `path` names in `module`, through namespaces it imports. */
    const constantNamed = async (path: readonly string[], module: Module): Promise<{ readonly module: Module; readonly declaration: Declarator } | null> => {
        const [first] = path;
        if (first === undefined) return null;
        if (path.length > 1) return await throughNamespaces(module, path, memberConstant);
        const local = module.constants.get(first);
        if (local !== undefined) return { module, declaration: local };
        const imported = module.imports.get(first);
        return imported === undefined || imported.imported === null ? null : await fromSource(module, imported.source, imported.imported, constantsIn, new Set());
    };

    const functionsIn = (module: Module): ReadonlyMap<string, FunctionDeclared> => module.functions;

    /**
     * The declared return type of the function a name calls: a function declaration's, or a constant's holding a
     * function or typed as one, through imports. Undefined for a function declaring none, null for no function found.
     */
    const returnTypeNamed = async (path: readonly string[], module: Module): Promise<{ readonly module: Module; readonly type: TypeNode } | undefined | null> => {
        const [first] = path;
        if (first === undefined) return null;
        if (path.length === 1) {
            const local = module.functions.get(first);
            const imported = module.imports.get(first);
            const declared = local !== undefined ? { module, declaration: local }
                : imported === undefined || imported.imported === null ? null : await fromSource(module, imported.source, imported.imported, functionsIn, new Set());
            if (declared !== null) {
                const returned = declared.declaration.returnType?.typeAnnotation;
                return returned === undefined ? undefined : { module: declared.module, type: returned };
            }
        }
        const constant = await constantNamed(path, module);
        if (constant === null) return null;
        const { id, init } = constant.declaration;
        const annotation = id.type === "Identifier" ? id.typeAnnotation?.typeAnnotation : undefined;
        if (annotation?.type === "TSFunctionType") return { module: constant.module, type: annotation.returnType.typeAnnotation };
        if (init?.type === "ArrowFunctionExpression" || init?.type === "FunctionExpression") {
            const returned = init.returnType?.typeAnnotation;
            return returned === undefined ? undefined : { module: constant.module, type: returned };
        }
        return null;
    };

    /** The package's own declaration a found type is, by its path in the package: `Schema.Type` and `Entity`. */
    const intrinsic = (found: Found): "schema" | "entity" | null => {
        if (typeof found === "string") return null;
        const path = host.packagePath(found.module.file);
        const { declaration, within } = found;
        if (declaration.id === null) return null;
        const name = [...within, declaration.id.name].join(".");
        if (path === "interface/schema/schema" && name === "Schema.Type") return "schema";
        if (path === "interface/entity/entity" && name === "Entity") return "entity";
        return null;
    };

    const nameParts = (name: Named | Extract<Named, { readonly type: "TSQualifiedName" }>["left"]): readonly string[] =>
        name.type === "Identifier" ? [name.name] : name.type === "TSQualifiedName" ? [...nameParts(name.left), name.right.name] : [];

    /** What a use calls the thing it converts, in failures. */
    const words = (use: Use) => use === "input"
        ? { a: "an input", the: "an input's", supported: "a type literal, an alias or interface of one, `number`, `string`, `boolean`, `null`, a literal, a union, an array, a tuple of one type, `ReadonlySet`, `ReadonlyMap`, the values of an `as const` object, a type named by `Schema.Type`, `Entity`, a class or `unknown`" }
        : { a: "a declared type", the: "a declared type's", supported: "a type literal, an alias or interface of one, `number`, `string`, `boolean`, `null`, a literal, a union, an array, a tuple of one type, `ReadonlySet`, `ReadonlyMap`, the values of an `as const` object, a type named by `Schema.Type` or `Entity`, or a value that isn't data: a class, a function or `unknown`" };

    /** For an input, any value; for a declaration, a throw saying the type isn't data. */
    const notData = (use: Use, node: boolean): Schema => {
        if (use === "input") return anything;
        const thrown: NotData = { notData: { node } };
        throw thrown;
    };

    /** Whether a class is a DOM `Node`: one of the DOM's, or one extending one, as far as its declarations are read. */
    const isNode = async (declaration: Class, module: Module, seen: Set<Class>): Promise<boolean> => {
        const { superClass } = declaration;
        if (superClass === null || superClass.type !== "Identifier" || seen.has(declaration)) return false;
        seen.add(declaration);
        const found = await typeNamed([superClass.name], module);
        if (found === "global") return domNode.test(superClass.name);
        if (found === null || found === "enum" || found.declaration.type === "TSTypeAliasDeclaration" || found.declaration.type === "TSInterfaceDeclaration") return false;
        return await isNode(found.declaration, found.module, seen);
    };

    /** The schema of a type, read in `module`; `active` holds the declarations being converted, so recursion fails. */
    const convert = async (type: TypeNode, module: Module, active: ReadonlySet<Declared>, use: Use): Promise<Schema> => {
        const { a, the, supported } = words(use);
        switch (type.type) {
            case "TSNumberKeyword": return { type: "number" };
            case "TSStringKeyword": return { type: "string" };
            case "TSBooleanKeyword": return { type: "boolean" };
            case "TSNullKeyword": return { type: "null" };
            case "TSUnknownKeyword": return notData(use, false);
            case "TSFunctionType": case "TSConstructorType":
                return use === "declaration" ? notData(use, false) : fail(module, type, `${a} is ${supported}`);
            case "TSParenthesizedType": return await convert(type.typeAnnotation, module, active, use);
            case "TSTypeOperator":
                return type.operator === "readonly" ? await convert(type.typeAnnotation, module, active, use) : fail(module, type, `\`${type.operator}\` isn't ${a}: ${a} is ${supported}`);
            case "TSLiteralType": {
                const { literal } = type;
                if (literal.type === "Literal" && (typeof literal.value === "string" || typeof literal.value === "number" || typeof literal.value === "boolean")) return { const: literal.value };
                if (literal.type === "UnaryExpression" && literal.operator === "-" && literal.argument.type === "Literal" && typeof literal.argument.value === "number") return { const: -literal.argument.value };
                return fail(module, type, `${the} literal type is a string, number or boolean`);
            }
            case "TSUnionType": {
                const types = type.types.filter(member => member.type !== "TSUndefinedKeyword");
                if (types.length !== type.types.length) return fail(module, type, `${a} that may be missing is optional (\`field?:\`) rather than \`| undefined\``);
                const schemas = await Promise.all(types.map(member => convert(member, module, active, use)));
                return { anyOf: schemas };
            }
            case "TSArrayType": return { type: "array", items: await convert(type.elementType, module, active, use) };
            case "TSTupleType": {
                const elements = type.elementTypes;
                const first = elements[0];
                if (first === undefined) return fail(module, type, `${the} tuple has elements`);
                const schemas = await Promise.all(elements.map(element => element.type === "TSOptionalType" || element.type === "TSRestType" || element.type === "TSNamedTupleMember"
                    ? fail(module, element, `${the} tuple has a fixed length, and its elements no names`) : convert(element, module, active, use)));
                const items = schemas[0];
                if (items === undefined || schemas.some(schema => JSON.stringify(schema) !== JSON.stringify(items))) return fail(module, type, `${the} tuple has elements of one type`);
                return { type: "array", items, minItems: elements.length, maxItems: elements.length };
            }
            case "TSTypeLiteral": return await objectOf(type.members, [], module, active, type, use);
            case "TSIntersectionType": {
                const parts = await Promise.all(type.types.map(member => convert(member, module, active, use)));
                const properties: { [field: string]: Schema } = {};
                const required: string[] = [];
                let optional = false;
                for (const part of parts) {
                    if (!("type" in part) || part.type !== "object") return fail(module, type, `${the} intersection joins object types`);
                    for (const [field, schema] of Object.entries(part.properties)) properties[field] = schema;
                    if (part.required === undefined) required.push(...Object.keys(part.properties));
                    else {
                        optional = true;
                        required.push(...part.required);
                    }
                }
                return optional ? { type: "object", properties, required } : { type: "object", properties };
            }
            case "TSTypeReference": return await referenced(type, module, active, use);
            case "TSIndexedAccessType": return await valuesOf(type, module, use);
            default: return fail(module, type, `${a} is ${supported}`);
        }
    };

    const objectOf = async (members: readonly Member[], inherited: readonly Schema[], module: Module, active: ReadonlySet<Declared>, at: Node, use: Use): Promise<Schema> => {
        const { a, the } = words(use);
        const properties: { [field: string]: Schema } = {};
        const required: string[] = [];
        let optional = false;
        for (const schema of inherited) {
            if (!("type" in schema) || schema.type !== "object") return fail(module, at, `${a} interface extends object types`);
            for (const [field, property] of Object.entries(schema.properties)) properties[field] = property;
            if (schema.required === undefined) required.push(...Object.keys(schema.properties));
            else {
                optional = true;
                required.push(...schema.required);
            }
        }
        for (const member of members) {
            if (member.type === "TSMethodSignature") return notData(use, false);
            if (member.type !== "TSPropertySignature" || member.computed) return fail(module, member, `${the} fields are named properties`);
            const { key } = member;
            const field = key.type === "Identifier" ? key.name : key.type === "Literal" && typeof key.value === "string" ? key.value : fail(module, member, `${the} fields are named properties`);
            if (member.typeAnnotation === null) return fail(module, member, `${use === "input" ? "input" : "declared"} field "${field}" has a type`);
            properties[field] = await convert(member.typeAnnotation.typeAnnotation, module, active, use);
            if (member.optional) optional = true;
            else required.push(field);
        }
        return optional ? { type: "object", properties, required } : { type: "object", properties };
    };

    const declared = async (found: Exclude<Found, string>, active: ReadonlySet<Declared>, at: Node, module: Module, use: Use): Promise<Schema> => {
        const { declaration } = found;
        const { a } = words(use);
        const name = declaration.id?.name ?? "default";
        if (declaration.type !== "TSTypeAliasDeclaration" && declaration.type !== "TSInterfaceDeclaration") return notData(use, await isNode(declaration, found.module, new Set()));
        if (active.has(declaration)) return fail(module, at, `${use === "input" ? "input" : "declared"} type ${name} refers to itself`);
        if (declaration.typeParameters !== null) return fail(module, at, `${use === "input" ? "input" : "declared"} type ${name} is generic, which ${a} isn't`);
        const inner = new Set(active).add(declaration);
        if (declaration.type === "TSTypeAliasDeclaration") return await convert(declaration.typeAnnotation, found.module, inner, use);
        const inherited = await Promise.all(declaration.extends.map(async heritage => {
            const { expression } = heritage;
            if (expression.type !== "Identifier" || heritage.typeArguments !== null) return fail(found.module, heritage, `${a} interface extends named, non-generic types`);
            return await named([expression.name], found.module, inner, heritage, use);
        }));
        return await objectOf(declaration.body.body, inherited, found.module, inner, declaration, use);
    };

    /** The schema of the type `path` names in `module`. */
    const named = async (path: readonly string[], module: Module, active: ReadonlySet<Declared>, at: Node, use: Use): Promise<Schema> => {
        const found = await typeNamed(path, module);
        if (found === null) return fail(module, at, `${use === "input" ? "input" : "declared"} type ${path.join(".")} isn't a type alias, interface or class its module declares or exports, which this pass can read`);
        if (found === "enum") return fail(module, at, `${path.join(".")} is an enum, which isn't ${words(use).a}: use a union of literals, or the values of an \`as const\` object`);
        // Declared nowhere, it's a global, which TypeScript checked exists: a class, such as the platform's.
        if (found === "global") return notData(use, path.length === 1 && domNode.test(path[0] ?? ""));
        if (intrinsic(found) === "entity") return { type: "integer", format: "entity" };
        return await declared(found, active, at, module, use);
    };

    const referenced = async (type: Extract<TypeNode, { readonly type: "TSTypeReference" }>, module: Module, active: ReadonlySet<Declared>, use: Use): Promise<Schema> => {
        const path = nameParts(type.typeName);
        const parameters = type.typeArguments?.params ?? [];
        const [only] = path;
        if (path.length === 1 && only !== undefined && !module.types.has(only) && !module.imports.has(only)) {
            const [first, second] = parameters;
            if ((only === "ReadonlyArray" || only === "Array") && parameters.length === 1 && first !== undefined) return { type: "array", items: await convert(first, module, active, use) };
            // A Set or Map changes in place, so as a declared type it isn't data.
            if ((only === "Set" || only === "Map") && use === "declaration") return notData(use, false);
            if ((only === "ReadonlySet" || only === "Set") && parameters.length === 1 && first !== undefined) return { type: "set", items: await convert(first, module, active, use) };
            if ((only === "ReadonlyMap" || only === "Map") && parameters.length === 2 && first !== undefined && second !== undefined) {
                return { type: "map", keys: await convert(first, module, active, use), values: await convert(second, module, active, use) };
            }
        }
        if (parameters.length === 0) return await named(path, module, active, type, use);
        const found = await typeNamed(path, module);
        const [argument] = parameters;
        if (found !== null && intrinsic(found) === "schema" && parameters.length === 1 && argument !== undefined) {
            const schema = await valueOfType(argument, module, new Set());
            if (!isSchema(schema)) return fail(module, argument, "Schema.Type takes a schema");
            if (!holdsDefault(schema)) return schema;
            // The alias being read, the latest declaration entered, is the one to give a namespace.
            const alias = [...active].at(-1);
            const name = alias?.type === "TSTypeAliasDeclaration" ? alias.id.name : "its alias";
            return fail(module, argument, `a schema holds no default: give ${name} a namespace with one, \`const ${alias?.type === "TSTypeAliasDeclaration" ? name : "T"} = { default: ... }\``);
        }
        return fail(module, type, `${use === "input" ? "input" : "declared"} type ${path.join(".")} takes type arguments, which ${words(use).a} doesn't, except Schema.Type`);
    };

    /** The value a literal type writes, as `Schema.Type`'s argument does: literals, tuples, object types, `typeof` a constant. */
    const valueOfType = async (type: TypeNode, module: Module, active: ReadonlySet<object>): Promise<Value> => {
        const unreadable = (): never => fail(module, type, "a schema type's argument is written as a literal type, or `typeof` a constant whose value is a literal");
        switch (type.type) {
            case "TSParenthesizedType": return await valueOfType(type.typeAnnotation, module, active);
            case "TSTypeOperator": return type.operator === "readonly" ? await valueOfType(type.typeAnnotation, module, active) : unreadable();
            case "TSNullKeyword": return null;
            case "TSLiteralType": {
                const { literal } = type;
                if (literal.type === "Literal" && (typeof literal.value === "string" || typeof literal.value === "number" || typeof literal.value === "boolean")) return literal.value;
                if (literal.type === "UnaryExpression" && literal.operator === "-" && literal.argument.type === "Literal" && typeof literal.argument.value === "number") return -literal.argument.value;
                return unreadable();
            }
            case "TSTupleType": return await Promise.all(type.elementTypes.map(element => element.type === "TSOptionalType" || element.type === "TSRestType" || element.type === "TSNamedTupleMember" ? unreadable() : valueOfType(element, module, active)));
            case "TSTypeLiteral": {
                const value: { [field: string]: Value } = {};
                for (const member of type.members) {
                    if (member.type !== "TSPropertySignature" || member.computed || member.typeAnnotation === null) return unreadable();
                    const { key } = member;
                    const field = key.type === "Identifier" ? key.name : key.type === "Literal" && typeof key.value === "string" ? key.value : unreadable();
                    value[field] = await valueOfType(member.typeAnnotation.typeAnnotation, module, active);
                }
                return value;
            }
            case "TSTypeReference": {
                if (type.typeArguments !== null) return unreadable();
                const found = await typeNamed(nameParts(type.typeName), module);
                if (found === null || typeof found === "string" || found.declaration.type !== "TSTypeAliasDeclaration" || active.has(found.declaration)) return unreadable();
                return await valueOfType(found.declaration.typeAnnotation, found.module, new Set(active).add(found.declaration));
            }
            case "TSTypeQuery": {
                if (type.exprName.type === "TSImportType" || type.exprName.type === "ThisExpression" || type.typeArguments !== null) return unreadable();
                const found = await constantNamed(nameParts(type.exprName), module);
                if (found === null) return fail(module, type, `${nameParts(type.exprName).join(".")} isn't a constant its module declares or exports, which this pass can read`);
                return await valueOfConstant(found.declaration, found.module, active);
            }
            default: return unreadable();
        }
    };

    /** A constant's value, from its initializer, or, declared without one, from its literal type. */
    const valueOfConstant = async (declarator: Declarator, module: Module, active: ReadonlySet<object>): Promise<Value> => {
        if (active.has(declarator)) return fail(module, declarator, `${nameOfDeclarator(declarator)} refers to itself`);
        const inner = new Set(active).add(declarator);
        if (declarator.init !== null) return await valueOf(declarator.init, module, inner);
        const annotation = declarator.id.type === "Identifier" ? declarator.id.typeAnnotation : null;
        return annotation === null || annotation === undefined ? fail(module, declarator, `${nameOfDeclarator(declarator)} has a value`) : await valueOfType(annotation.typeAnnotation, module, inner);
    };

    /** An expression's value, as a constant's initializer writes it: literals, arrays, objects and other constants. */
    const valueOf = async (expression: Expression, module: Module, active: ReadonlySet<object>): Promise<Value> => {
        const unreadable = (): never => fail(module, expression, "a constant read for its value is written as literals, arrays, objects and other constants");
        switch (expression.type) {
            case "TSAsExpression": case "TSSatisfiesExpression": case "TSNonNullExpression": case "ParenthesizedExpression":
                return await valueOf(expression.expression, module, active);
            case "Literal":
                return typeof expression.value === "string" || typeof expression.value === "number" || typeof expression.value === "boolean" || (expression.value === null && expression.raw === "null") ? expression.value : unreadable();
            case "UnaryExpression":
                return expression.operator === "-" && expression.argument.type === "Literal" && typeof expression.argument.value === "number" ? -expression.argument.value : unreadable();
            case "ArrayExpression":
                return await Promise.all(expression.elements.map(element => element === null || element.type === "SpreadElement" ? unreadable() : valueOf(element, module, active)));
            case "ObjectExpression": {
                const value: { [field: string]: Value } = {};
                for (const property of expression.properties) {
                    if (property.type === "SpreadElement") {
                        const spread = await valueOf(property.argument, module, active);
                        if (typeof spread !== "object" || spread === null || Array.isArray(spread)) return unreadable();
                        Object.assign(value, spread);
                        continue;
                    }
                    if (property.computed || property.kind !== "init" || property.method) return unreadable();
                    const { key } = property;
                    const field = key.type === "Identifier" ? key.name : key.type === "Literal" && typeof key.value === "string" ? key.value : unreadable();
                    value[field] = await valueOf(property.value, module, active);
                }
                return value;
            }
            case "Identifier": case "MemberExpression": {
                const path = pathOf(expression);
                const found = path === null ? null : await constantNamed(path, module);
                return found === null ? unreadable() : await valueOfConstant(found.declaration, found.module, active);
            }
            default: return unreadable();
        }
    };

    /** `(typeof X)[keyof typeof X]`: the values of the `as const` object `X`, as a union of their literals. */
    const valuesOf = async (type: Extract<TypeNode, { readonly type: "TSIndexedAccessType" }>, module: Module, use: Use): Promise<Schema> => {
        const { the } = words(use);
        const queried = (node: TypeNode): string | null => {
            const inner = node.type === "TSParenthesizedType" ? node.typeAnnotation : node;
            return inner.type === "TSTypeQuery" && inner.typeArguments === null && inner.exprName.type === "Identifier" ? inner.exprName.name : null;
        };
        const name = queried(type.objectType);
        const index = type.indexType.type === "TSTypeOperator" && type.indexType.operator === "keyof" ? queried(type.indexType.typeAnnotation) : null;
        if (name === null || index !== name) return fail(module, type, `${the} indexed access type is \`(typeof X)[keyof typeof X]\`, the values of an \`as const\` object`);
        const found = await constantNamed([name], module);
        if (found === null) return fail(module, type, `${name} isn't a constant its module declares or exports, which this pass can read`);
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

    return { convert, read, site, fail, typeNamed, constantNamed, returnTypeNamed, valueOfType };
};

/** A name and the properties read from it, `Entity.none` as `["Entity", "none"]`; null for any other expression. */
export const pathOf = (expression: Node): readonly string[] | null => {
    if (expression.type === "Identifier" && "name" in expression && typeof expression.name === "string") return [expression.name];
    if (expression.type !== "MemberExpression" || !("object" in expression) || !("property" in expression) || ("computed" in expression && expression.computed === true)) return null;
    const { object, property } = expression;
    if (typeof object !== "object" || object === null || typeof property !== "object" || property === null || !isNode(object)) return null;
    const head = pathOf(object);
    const name: unknown = Reflect.get(property, "name");
    return head === null || typeof name !== "string" ? null : [...head, name];
};

const isNode = (value: object): value is Node => typeof Reflect.get(value, "start") === "number" && typeof Reflect.get(value, "end") === "number" && typeof Reflect.get(value, "type") === "string";

// `Schema.Type`'s argument is constrained to `Schema` where it's written, so TypeScript checked an object's form.
/**
 * Whether a schema a schema type writes holds a `default` as a keyword: at its top or in a schema inside it, never in
 * a property's name or a `const`'s value.
 */
const holdsDefault = (schema: unknown): boolean => {
    if (typeof schema !== "object" || schema === null || Array.isArray(schema)) return false;
    if ("default" in schema) return true;
    const inside = (keyword: string): unknown => Reflect.get(schema, keyword);
    const listed = (keyword: string): boolean => {
        const members = inside(keyword);
        return Array.isArray(members) && members.some(holdsDefault);
    };
    const properties = inside("properties");
    return holdsDefault(inside("items")) || holdsDefault(inside("keys")) || holdsDefault(inside("values")) || listed("anyOf") || listed("allOf")
        || (typeof properties === "object" && properties !== null && Object.values(properties).some(holdsDefault));
};

const isSchema = (value: unknown): value is Schema => typeof value === "object" && value !== null && !Array.isArray(value);
