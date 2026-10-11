import type { Node } from 'estree';

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
