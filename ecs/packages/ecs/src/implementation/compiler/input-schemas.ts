// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Failure } from './failure.js';
import type { Insertion } from './source-map.js';
import { createConverter, isThrown, type Module, type Node, type Statement, type TypeHost, type TypeNode } from './type-schemas.js';

/** Whether an import specifier, resolved from `importer`, is a module of the package exporting `System`. */
export type IsSystem = (specifier: string, importer: string) => Promise<boolean>;

export type InputHost = TypeHost & { readonly isSystem: IsSystem };

/** What a pass inserts into a module, and the files whose types it read; or why it failed. */
export type PassResult =
    | { readonly insertions: readonly Insertion[]; readonly dependencies: readonly string[] }
    | { readonly failure: Failure; readonly dependencies: readonly string[] };

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
export const inputInsertions = async (module: Module, host: InputHost): Promise<PassResult | null> => {
    const { code, file, program } = module;
    if (!code.includes("System") || !code.includes(".create(")) return null;
    const converter = createConverter(host, file);
    const { fail } = converter;
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
    const insertions: Insertion[] = [];
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
            const schema = await converter.convert(annotation, module, new Set(), "input");
            if (!("type" in schema) || schema.type !== "object") fail(module, parameter, "a body's input is an object of named fields");
            insertions.push({ at: second.end, text: `, ${JSON.stringify(schema)}` });
        }
    } catch (error) {
        if (isThrown(error)) return { failure: error.typeFailure, dependencies: [...converter.read] };
        throw error;
    }
    if (insertions.length === 0) return null;
    return { insertions, dependencies: [...converter.read] };
};

type Parameter = FunctionNode["params"][number];

const annotationOf = (parameter: Parameter | undefined): TypeNode | null => {
    if (parameter === undefined || parameter.type === "TSParameterProperty") return null;
    const annotation = parameter.type === "RestElement" ? parameter.typeAnnotation : parameter.typeAnnotation;
    return annotation === null || annotation === undefined ? null : annotation.typeAnnotation;
};
