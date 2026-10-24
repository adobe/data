// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ConditionalExpression, Identifier, LogicalExpression, Node } from 'estree';
import { access } from './access.js';
import { observe, set } from './booleans.js';
import { mergeBranches } from './branches.js';
import { call } from './calls.js';
import { dataValue, leavesOf, mapLeaves, sameShape, toData, type Data } from './data.js';
import { fail } from './failure.js';
import { isBinary, isUnary, local, not, number, type Expression } from './ir.js';
import { memberKey } from './key.js';
import { moduleValue } from './module-value.js';
import type { Out } from './out.js';
import { scalar } from './scalar.js';
import { presence } from './columns.js';
import { findLocal, rootScope, type Scope } from './scope.js';
import { fresh } from './unit.js';
import { scalarValue, type Value } from './value.js';

const isTrivial = (expression: Expression): boolean =>
    expression.kind === "local" || expression.kind === "number" || expression.kind === "boolean";

const identifier = (node: Identifier, scope: Scope, out: Out): Value => {
    const local = findLocal(scope, node.name);
    if (local !== undefined) return local.value;
    const binding = scope.module.bindings.get(node.name);
    if (binding !== undefined) return moduleValue(node, node.name, binding, scope.module, scope, out);
    switch (node.name) {
        case "Math": return { kind: "math" };
        case "Infinity": return scalarValue(number(Infinity));
        case "NaN": return scalarValue(number(NaN));
        case "undefined": return scalarValue({ kind: "nullish", value: "undefined" });
        default: return fail(node, `${node.name} is not defined in the kernel`);
    }
};

/** `test ? a : b` over any matching shapes. Branches that emit statements become an `if`. */
const conditional = (node: ConditionalExpression, scope: Scope, out: Out): Value => {
    const unit = scope.unit;
    const test = scalar(unit.expression(node.test, scope, out), node.test, scope);
    const consequentOut: Out = [];
    const alternateOut: Out = [];
    const consequent = toData(unit.expression(node.consequent, scope, consequentOut), node.consequent, scope);
    const alternate = toData(unit.expression(node.alternate, scope, alternateOut), node.alternate, scope);
    return mergeBranches(node, test, consequent, consequentOut, alternate, alternateOut, scope, out);
};

/** `a && b`, `a || b`, `a ?? b`. A right side that emits statements runs only when needed. */
const logical = (node: LogicalExpression, scope: Scope, out: Out): Value => {
    const unit = scope.unit;
    const left = scalar(unit.expression(node.left, scope, out), node.left, scope);
    const rightOut: Out = [];
    const right = scalar(unit.expression(node.right, scope, rightOut), node.right, scope);
    if (rightOut.length === 0) return scalarValue({ kind: "logical", operator: node.operator, left, right });
    const name = fresh(unit, "t");
    const current = local(name);
    const condition: Expression = node.operator === "&&" ? current : node.operator === "||" ? not(current)
        : { kind: "binary", operator: "==", left: current, right: { kind: "nullish", value: "null" } };
    out.push(set(unit, name, left, "let"), { kind: "if", test: condition, consequent: [...rightOut, set(unit, name, right, undefined)], alternate: [] });
    return scalarValue(current);
};

const literal = (node: Extract<Node, { type: "Literal" }>): Value => {
    if (typeof node.value === "number") return scalarValue(number(node.value));
    if (typeof node.value === "boolean") return scalarValue({ kind: "boolean", value: node.value });
    if (node.value === null) return scalarValue({ kind: "nullish", value: "null" });
    return fail(node, "only number, boolean and null literals are in the kernel subset");
};

/** Compiles an expression to a value, emitting any statements it needs into `out`. */
/**
 * `value === undefined` and its variants, `== null` included, for an optional component's whole value: whether the
 * call's archetype lacks it, or has it. Null for anything else.
 */
const presenceTest = (operator: string, value: Value, other: Value, scope: Scope): Expression | null => {
    if (!["===", "!==", "==", "!="].includes(operator) || other.kind !== "scalar" || other.expression.kind !== "nullish") return null;
    if (other.expression.value === "null" && (operator === "===" || operator === "!==")) return null;
    const { unit } = scope;
    const present = value.kind === "snapshot" && value.path.length === 0 ? value.snapshot.presence
        : value.kind === "component" && value.up !== true && value.path.length === 0 && unit.signature.optional.has(value.component) ? presence(unit, value.component)
        : null;
    if (present === null) return null;
    return operator === "!==" || operator === "!=" ? present : not(present);
};

export const expression = (node: Node, scope: Scope, out: Out): Value => {
    switch (node.type) {
        case "Literal":
            return literal(node);
        case "Identifier":
            return identifier(node, scope, out);
        case "ArrayExpression":
            return {
                kind: "tuple", items: node.elements.map(element => element === null ? fail(node, "holes are not in the kernel subset")
                    : element.type === "SpreadElement" ? fail(element, "spread is not in the kernel subset")
                    : expression(element, scope, out)),
            };
        case "ObjectExpression":
            return {
                kind: "struct", fields: node.properties.map(property => {
                    if (property.type === "SpreadElement") return fail(property, "spread is not in the kernel subset");
                    if (property.kind !== "init" || property.method || property.computed) return fail(property, "struct literals use plain field names");
                    const name = property.key.type === "Identifier" ? property.key.name
                        : property.key.type === "Literal" && typeof property.key.value === "string" ? property.key.value
                        : fail(property.key, "struct literals use plain field names");
                    const value = expression(property.value, scope, out);
                    return [name, value] satisfies readonly [string, Value];
                }),
            };
        case "UnaryExpression":
            if (!isUnary(node.operator)) return fail(node, `${node.operator} is not in the kernel subset`);
            return scalarValue({ kind: "unary", operator: node.operator, operand: scalar(expression(node.argument, scope, out), node.argument, scope) });
        case "BinaryExpression": {
            const operator = node.operator;
            if (!isBinary(operator) || node.left.type === "PrivateIdentifier") return fail(node, `${node.operator} is not in the kernel subset`);
            const leftValue = expression(node.left, scope, out);
            const rightValue = expression(node.right, scope, out);
            // An optional component tested for undefined is its archetype's presence, the same for every row of a call.
            const tested = presenceTest(operator, leftValue, rightValue, scope) ?? presenceTest(operator, rightValue, leftValue, scope);
            if (tested !== null) return scalarValue(tested);
            const left = scalar(leftValue, node.left, scope);
            const right = scalar(rightValue, node.right, scope);
            // Strict equality tells true from 1, so boolean reads are converted here.
            const strict = operator === "===" || operator === "!==";
            return scalarValue(strict
                ? { kind: "binary", operator, left: observe(scope.unit, left), right: observe(scope.unit, right) }
                : { kind: "binary", operator, left, right });
        }
        case "LogicalExpression":
            return logical(node, scope, out);
        case "ConditionalExpression":
            return conditional(node, scope, out);
        case "MemberExpression":
            if (node.object.type === "Super") return fail(node, "super is not in the kernel subset");
            return access(expression(node.object, scope, out), memberKey(node, scope, out), node, scope, node.optional);
        case "ChainExpression":
            return expression(node.expression, scope, out);
        case "CallExpression":
            return call(node, scope, out);
        case "AssignmentExpression": case "UpdateExpression":
            return fail(node, "assignments must be statements in a kernel");
        case "ArrowFunctionExpression": case "FunctionExpression":
            return fail(node, "functions can't be created in a kernel; define helpers at module scope");
        default:
            return fail(node, `${node.type} is not in the kernel subset`);
    }
};
