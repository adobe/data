// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Schema } from '../../interface/schema/schema.js';
import type { PassResult } from './input-schemas.js';
import type { Insertion } from './source-map.js';
import { createConverter, isNotData, isThrown, type Module, type Node, type Statement, type TypeHost, type TypeNode } from './type-schemas.js';

/** The module emitted code imports its registry hooks from, for the module being transformed. */
export type DeclareModuleOf = (file: string) => string;

export type AugmentationHost = TypeHost & { readonly declareModule: DeclareModuleOf };

type Block = Extract<Statement, { readonly type: "TSModuleDeclaration"; readonly global: false }>;
type Interface = Extract<Statement, { readonly type: "TSInterfaceDeclaration" }>;
type Member = Interface["body"]["body"][number];
type Property = Extract<Member, { readonly type: "TSPropertySignature" }>;
type Value = string | number | boolean | null | readonly Value[] | { readonly [field: string]: Value };

const kinds = { Components: "component", Resources: "resource", Traits: "trait" } as const;
const isKind = (name: string): name is keyof typeof kinds => name in kinds;

/** The interfaces of each top-level `declare module "@adobe/ecs"` block, with the block. */
const augmentationsOf = (module: Module): readonly { readonly block: Block; readonly interfaces: readonly Interface[] }[] =>
    module.program.body.flatMap(statement => {
        if (statement.type !== "TSModuleDeclaration" || statement.global !== false || statement.id.type !== "Literal" || statement.id.value !== "@adobe/ecs") return [];
        const body = statement.body?.type === "TSModuleBlock" ? statement.body.body : [];
        const interfaces = body.flatMap(inner => {
            const declared = inner.type === "ExportNamedDeclaration" ? inner.declaration : inner;
            return declared?.type === "TSInterfaceDeclaration" && isKind(declared.id.name) ? [declared] : [];
        });
        return [{ block: statement, interfaces }];
    });

type QueryName = Exclude<Extract<TypeNode, { readonly type: "TSTypeQuery" }>["exprName"], { readonly type: "TSImportType" }>;

/** A `typeof` query's name and the properties read from it; null for `this`. */
const qualifiedParts = (name: QueryName | Extract<QueryName, { readonly type: "TSQualifiedName" }>["left"]): readonly string[] | null => {
    if (name.type === "Identifier") return [name.name];
    if (name.type !== "TSQualifiedName") return null;
    const left = qualifiedParts(name.left);
    return left === null ? null : [...left, name.right.name];
};

/** Tests and their helpers in the package, which declare keys as consumers do. */
const testModule = /\.(test|type-test|fixture|test-helper|cases)\.tsx?$/;

/** Whether a file is one of the package's own modules, whose built-in keys register themselves. */
const isLibraryModule = (path: string | null, file: string): boolean =>
    path !== null && (path.startsWith("interface/") || path.startsWith("implementation/")) && !testModule.test(file);

/** The top-level statement holding a node of the module, by position. */
const statementAt = (module: Module, node: Node): Statement | undefined =>
    module.program.body.find(statement => statement.start <= node.start && node.end <= statement.end);

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

/** Whether a type, as written, allows `null`. */
const allowsNullType = (type: TypeNode): boolean =>
    type.type === "TSNullKeyword" || (type.type === "TSUnionType" && type.types.some(allowsNullType)) || (type.type === "TSParenthesizedType" && allowsNullType(type.typeAnnotation));

const allowsNullSchema = (schema: Schema): boolean =>
    ("type" in schema && schema.type === "null") || ("const" in schema && schema.const === null) || ("anyOf" in schema && schema.anyOf.some(allowsNullSchema));

/**
 * Registers what each `declare module "@adobe/ecs"` block declares, so consumers never write registration: after the
 * block, each component and resource of `Components` and `Resources`, with the schema of its `type`, its `default` and
 * its other traits as declared, and each trait of `Traits` keyed by a symbol. A key is a top-level `Symbol()` constant,
 * of the module or one it imports. A literal default is checked against the schema; `default: typeof value` names a
 * value, which the registration passes. Returns null when the module declares nothing.
 */
export const augmentationInsertions = async (module: Module, host: AugmentationHost): Promise<PassResult | null> => {
    const { code, file } = module;
    if (!code.includes("@adobe/ecs") || !code.includes("declare module") || isLibraryModule(host.packagePath(file), file)) return null;
    const augmentations = augmentationsOf(module);
    if (augmentations.length === 0) return null;
    const converter = createConverter(host, file);
    const { fail } = converter;
    const insertions: Insertion[] = [];
    const names = { component: "declareComponent$", resource: "declareResource$", trait: "declareTrait$" };
    const used = new Set<"component" | "resource" | "trait">();

    /** The end of the top-level statement declaring a local binding, which the registration comes after; 0 for an import. */
    const endOfLocal = (name: string): number => {
        const local = module.constants.get(name);
        return local === undefined ? 0 : statementAt(module, local)?.end ?? 0;
    };

    /** Fails unless `name` is a top-level `Symbol()` constant, here or where it's imported from. */
    const requireSymbol = async (name: string, at: Node, what: string): Promise<void> => {
        const found = await converter.constantNamed([name], module);
        let init = found?.declaration.init ?? null;
        while (init !== null && (init.type === "TSAsExpression" || init.type === "TSSatisfiesExpression" || init.type === "ParenthesizedExpression")) init = init.expression;
        const isSymbol = init?.type === "CallExpression" && init.callee.type === "Identifier" && init.callee.name === "Symbol";
        if (!isSymbol) fail(module, at, `${what} ${name} is a top-level \`Symbol()\` constant, of this module or one it imports`);
    };

    /** A trait's or default's value as code: a literal, or `typeof` a value, which names it; and that value's local binding. */
    const valueText = async (type: TypeNode, what: string): Promise<{ readonly text: string; readonly value?: Value; readonly local?: string }> => {
        if (type.type === "TSTypeQuery") {
            const named = type.exprName.type === "TSImportType" ? null : qualifiedParts(type.exprName);
            const [first] = named ?? [];
            if (named === null || first === undefined || type.typeArguments !== null) return fail(module, type, `${what} is a literal type, or \`typeof\` a value`);
            const imported = module.imports.get(first);
            const declaredHere = module.constants.has(first) || module.program.body.some(statement => {
                const declared = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
                return (declared?.type === "VariableDeclaration" && declared.declarations.some(declarator => declarator.id.type === "Identifier" && declarator.id.name === first))
                    || ((declared?.type === "FunctionDeclaration" || declared?.type === "ClassDeclaration") && declared.id?.name === first);
            });
            const global = imported === undefined && !declaredHere;
            if (imported !== undefined && !imported.value) fail(module, type, `${what} names ${first}, imported as a type only: import it as a value, which the registration passes`);
            return { text: named.join("."), local: global || imported !== undefined ? undefined : first };
        }
        const value = await converter.valueOfType(type, module, new Set());
        return { text: JSON.stringify(value), value };
    };

    try {
        // Traits first, so a component declaring one registers after it.
        const ordered = augmentations.flatMap(({ block, interfaces }) => interfaces.map(declared => ({ block, declared })))
            .sort((a, b) => Number(b.declared.id.name === "Traits") - Number(a.declared.id.name === "Traits"));
        for (const { block, declared } of ordered) {
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
                    await requireSymbol(key.name, member, "a trait's key");
                    used.add("trait");
                    insertions.push({ at: Math.max(block.end, endOfLocal(key.name)), text: `\n${names.trait}(${key.name});` });
                    continue;
                }
                if (!member.computed || key.type !== "Identifier") return fail(module, member, `a ${kind}'s key is a \`Symbol()\` constant, declared as \`[key]: { type: ... }\``);
                await requireSymbol(key.name, member, `a ${kind}'s key`);
                const declaration = member.typeAnnotation?.typeAnnotation;
                if (declaration?.type !== "TSTypeLiteral") return fail(module, member, `${key.name}'s declaration is a type literal of its traits: \`{ type: ... }\``);
                converter.site.at = member.start;
                let at = Math.max(block.end, endOfLocal(key.name));
                let typeNode: TypeNode | undefined;
                let defaultNode: TypeNode | undefined;
                const traits: string[] = [];
                let thread = false;
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
                const start = defaultNode === undefined ? undefined : await valueText(defaultNode, `${key.name}'s default`);
                if (start?.local !== undefined) at = Math.max(at, endOfLocal(start.local));
                if (schema !== undefined && start?.value !== undefined && !matches(schema, start.value)) fail(module, defaultNode ?? member, `${key.name}'s default isn't of its declared type`);
                const allowsNull = schema === undefined ? allowsNullType(typeNode) : allowsNullSchema(schema) || "default" in schema;
                if (kind === "resource" && start === undefined && !allowsNull) fail(module, member, `resource ${key.name} declares the value it starts at: \`default: ...\`, which a type allowing null may leave out`);
                const parts = schema === undefined ? [] : [`type: ${start === undefined ? JSON.stringify(schema) : `${JSON.stringify(schema).slice(0, -1)},"default":${start.text}}`}`];
                if (schema === undefined && start !== undefined) parts.push(`default: ${start.text}`);
                parts.push(...traits);
                used.add(kind);
                insertions.push({ at, text: `\n${names[kind]}(${key.name}, ${parts.length === 0 ? "{}" : `{ ${parts.join(", ")} }`});` });
            }
        }
    }
    catch (error) {
        if (isThrown(error)) return { failure: error.typeFailure, dependencies: [...converter.read] };
        throw error;
    }
    if (insertions.length === 0) return null;
    const imports = [...used].map(kind => `declare${kind[0]?.toUpperCase()}${kind.slice(1)} as ${names[kind]}`);
    insertions.unshift({ at: 0, text: `import { ${imports.join(", ")} } from ${JSON.stringify(host.declareModule(file))};\n` });
    return { insertions, dependencies: [...converter.read] };
};
