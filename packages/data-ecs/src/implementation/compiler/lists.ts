import type { ArrayExpression, Expression, Identifier, Node, Pattern, SpreadElement } from 'estree';
import type { ModuleScope } from './module-scope.js';

/** `Archetype.create(<array literal>)`, with `Archetype` imported under any name: its array literal, else null. */
const createdList = (node: Expression, module: ModuleScope): ArrayExpression | null => {
    if (node.type !== "CallExpression" || node.arguments.length !== 1) return null;
    const { callee } = node;
    if (callee.type !== "MemberExpression" || callee.computed || callee.object.type !== "Identifier" || callee.property.type !== "Identifier" || callee.property.name !== "create") return null;
    const binding = module.get(callee.object.name);
    const [list] = node.arguments;
    return binding?.kind === "import" && binding.imported === "Archetype" && list.type === "ArrayExpression" ? list : null;
};

/**
 * The array literal a list of keys is written as: the node itself, or the initializer of the module-scope `const` it
 * names, when that's an array literal or `Archetype.create` of one. Null for anything else.
 */
export const listLiteral = (node: Expression | Pattern | SpreadElement, module: ModuleScope): ArrayExpression | null => {
    if (node.type === "ArrayExpression") return node;
    if (node.type !== "Identifier") return null;
    const binding = module.get(node.name);
    if (binding?.kind !== "const") return null;
    return binding.init.type === "ArrayExpression" ? binding.init : createdList(binding.init, module);
};

/** Whether a node names a list of keys, as `listLiteral` reads one. */
export const isList = (node: Node, module: ModuleScope): boolean =>
    (node.type === "ArrayExpression" || node.type === "Identifier") && listLiteral(node, module) !== null;

/** A list literal's elements when each is an identifier bound at module scope; null otherwise. */
export const listIdentifiers = (list: ArrayExpression, module: ModuleScope): readonly Identifier[] | null => {
    const elements: Identifier[] = [];
    for (const element of list.elements) {
        if (element?.type !== "Identifier" || !module.has(element.name)) return null;
        elements.push(element);
    }
    return elements;
};
