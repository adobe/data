import type { AssignmentProperty, MemberExpression, Node, Property } from 'estree';
import { fail } from './failure.js';
import type { Out } from './out.js';
import { findLocal, type Scope } from './scope.js';
import type { Value } from './value.js';

/**
 * An index into a value: a static name or element, a binding of the kernel's own module (a component, resource or
 * command key), or a runtime value. In other modules, constants that are number or string literals fold to static indices.
 */
export type Key =
    | { readonly kind: "static"; readonly name: number | string }
    | { readonly kind: "binding"; readonly name: string }
    | { readonly kind: "value"; readonly value: Value };

const keyOf = (node: Node, computed: boolean, scope: Scope, out: Out): Key => {
    if (!computed && node.type === "Identifier") return { kind: "static", name: node.name };
    if (node.type === "Literal" && (typeof node.value === "number" || typeof node.value === "string")) return { kind: "static", name: node.value };
    if (node.type === "Identifier" && findLocal(scope, node.name) === undefined && scope.module === scope.unit.module && scope.module.bindings.has(node.name)) {
        return { kind: "binding", name: node.name };
    }
    if (node.type === "PrivateIdentifier") return fail(node, "private names are not in the kernel subset");
    const value = scope.unit.expression(node, scope, out);
    const expression = value.kind === "scalar" ? value.expression : undefined;
    if (expression?.kind === "number" || expression?.kind === "string") return { kind: "static", name: expression.value };
    return { kind: "value", value };
};

export const memberKey = (node: MemberExpression, scope: Scope, out: Out): Key => keyOf(node.property, node.computed, scope, out);

export const propertyKey = (property: Property | AssignmentProperty, scope: Scope, out: Out): Key => keyOf(property.key, property.computed, scope, out);
