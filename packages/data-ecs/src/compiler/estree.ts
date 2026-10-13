import type { Node, Pattern } from 'estree';

declare module 'estree' {
    interface BaseNode {
        /** Source offsets; the bundler's parser sets them on every node. */
        start: number;
        end: number;
    }
}

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

/** Every name declared anywhere inside `node`: variables, parameters, functions, classes and catch parameters. */
export const declaredIn = (node: Node, names: Set<string>): Set<string> => {
    switch (node.type) {
        case "VariableDeclarator": for (const name of patternNames(node.id)) names.add(name); break;
        case "FunctionDeclaration": case "FunctionExpression": case "ClassDeclaration": case "ClassExpression":
            if (node.id) names.add(node.id.name);
            break;
        case "CatchClause": if (node.param) for (const name of patternNames(node.param)) names.add(name); break;
        default: break;
    }
    if (isFunction(node) && (node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression" || node.type === "FunctionDeclaration")) {
        for (const param of node.params) for (const name of patternNames(param)) names.add(name);
    }
    for (const child of children(node)) declaredIn(child, names);
    return names;
};
