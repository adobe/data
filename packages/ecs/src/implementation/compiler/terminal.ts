// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Node, Pattern } from 'estree';
import { children, declaredIn } from './estree.js';

/** Whether `node`, a child of `parent`, names a property or label, or declares a binding, rather than referring to one. */
const isName = (node: Node, parent: Node | undefined): boolean => {
    switch (parent?.type) {
        case "MemberExpression": return parent.property === node && !parent.computed;
        case "Property": return parent.key === node && !parent.computed && !parent.shorthand;
        case "MethodDefinition": case "PropertyDefinition": return parent.key === node && !parent.computed;
        case "LabeledStatement": case "BreakStatement": case "ContinueStatement": return true;
        case "VariableDeclarator": return parent.id === node;
        default: return false;
    }
};

/** Whether a destructuring of the context binds plain names other than `commands`, with no rest. */
const destructuresOthers = (pattern: Pattern): boolean =>
    pattern.type === "ObjectPattern" && pattern.properties.every(property =>
        property.type === "Property" && !property.computed && property.key.type === "Identifier" && property.key.name !== "commands");

/** Whether a name is used anywhere in `node` as a reference: `arguments` or `eval` could reach the context. */
const refers = (node: Node, name: string, parent?: Node): boolean =>
    (node.type === "Identifier" && node.name === name && !isName(node, parent)) || children(node).some(child => refers(child, name, node));

/**
 * Whether a main-thread system's body provably never reaches its context's `commands`, so the system is terminal
 * where its declaration allows: its context, the parameter at `context`, is absent, destructured by plain names other
 * than `commands` with no rest, or a name the body doesn't redeclare and uses only as `name.property` for other
 * properties; and the body never refers to `arguments` or `eval`. A body it can't follow may reach them.
 */
export const neverReachesCommands = (body: Node, context: number): boolean => {
    if (body.type !== "ArrowFunctionExpression" && body.type !== "FunctionExpression") return false;
    if (refers(body.body, "eval") || (body.type === "FunctionExpression" && refers(body.body, "arguments"))) return false;
    const parameter = body.params[context];
    if (parameter === undefined) return body.params.every(each => each.type !== "RestElement");
    if (parameter.type !== "Identifier") return destructuresOthers(parameter);
    const { name } = parameter;
    let redeclared = false;
    declaredIn(body.body, declared => { if (declared === name) redeclared = true; });
    if (redeclared) return false;
    const reaches = (node: Node, parent: Node | undefined): boolean => {
        if (node.type === "Identifier" && node.name === name && !isName(node, parent)) {
            return !(parent?.type === "MemberExpression" && parent.object === node && !parent.computed
                && parent.property.type === "Identifier" && parent.property.name !== "commands");
        }
        return children(node).some(child => reaches(child, node));
    };
    return !reaches(body.body, body);
};
