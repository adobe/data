import type { Node, Pattern, Program } from 'estree';
import type { parseAst } from 'vite';

declare module 'estree' {
    interface BaseNode {
        /** Source offsets; the bundler's parser sets them on every node. */
        start: number;
        end: number;
    }
}

/** A program from the bundler's parser, as the ESTree program the compiler reads. */
export const estreeOf = (program: ReturnType<typeof parseAst>): Program =>
    // The bundler's parser emits ESTree for JavaScript; its own AST types model some nodes differently, such as a directive's literal.
    program as Program;

export const isNode = (value: unknown): value is Node =>
    typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";

/** The direct child nodes of `node`, in source order. */
export const children = (node: Node): readonly Node[] => {
    const result: Node[] = [];
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) {
            for (const item of value) {
                if (isNode(item)) result.push(item);
            }
        } else if (isNode(value)) {
            result.push(value);
        }
    }
    return result;
};

export const isFunction = (node: Node): boolean =>
    node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression" || node.type === "FunctionDeclaration";

export const patternNames = (pattern: Pattern): readonly string[] => {
    switch (pattern.type) {
        case "Identifier": return [pattern.name];
        case "ArrayPattern": return pattern.elements.flatMap(element => element === null ? [] : patternNames(element));
        case "ObjectPattern": return pattern.properties.flatMap(property => patternNames(property.type === "RestElement" ? property.argument : property.value));
        case "RestElement": return patternNames(pattern.argument);
        case "AssignmentPattern": return patternNames(pattern.left);
        case "MemberExpression": return [];
    }
};

/** Calls `declare` for each name declared anywhere inside `node`, once per declaration: variables, parameters, functions, classes and catch parameters. */
export const declaredIn = (node: Node, declare: (name: string) => void): void => {
    switch (node.type) {
        case "VariableDeclarator": for (const name of patternNames(node.id)) declare(name); break;
        case "FunctionDeclaration": case "FunctionExpression": case "ClassDeclaration": case "ClassExpression":
            if (node.id) declare(node.id.name);
            break;
        case "CatchClause": if (node.param) for (const name of patternNames(node.param)) declare(name); break;
        default: break;
    }
    if (node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression" || node.type === "FunctionDeclaration") {
        for (const param of node.params) for (const name of patternNames(param)) declare(name);
    }
    for (const child of children(node)) declaredIn(child, declare);
};
