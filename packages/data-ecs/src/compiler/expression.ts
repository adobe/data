import type { ConditionalExpression, Identifier, LogicalExpression, Node } from 'estree';
import { access } from './access.js';
import { assignment, observe } from './booleans.js';
import { call } from './calls.js';
import { dataValue, leavesOf, mapLeaves, sameShape, toData, type Data } from './data.js';
import { fail } from './failure.js';
import { memberKey } from './key.js';
import type { ModuleBinding } from './module-scope.js';
import type { Out } from './out.js';
import { scalar } from './scalar.js';
import { findLocal, rootScope, type Scope } from './scope.js';
import { fresh } from './unit.js';
import { scalarValue, type Value } from './value.js';

const unaryOperators: ReadonlySet<string> = new Set(["-", "+", "!", "~"]);
const isTrivial = (code: string): boolean => /^[\w$.]+$/.test(code);

const isKey = (scope: Scope, name: string): boolean => {
    const signature = scope.unit.signature;
    return signature.read.has(name) || signature.write.has(name) || signature.resources.includes(name)
        || signature.lookups.some(lookup => lookup.read.includes(name));
};

const moduleValue = (node: Identifier, binding: ModuleBinding, scope: Scope, out: Out): Value => {
    if (isKey(scope, node.name)) return fail(node, `${node.name} is a key; use it to index, as in row[${node.name}]`);
    switch (binding.kind) {
        case "function":
            return { kind: "function", name: node.name, params: binding.node.params, body: binding.node.body };
        case "const": {
            const init = binding.init;
            if (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression") {
                if (init.async || init.generator) return fail(init, `${node.name} must be a plain function to be inlined`);
                return { kind: "function", name: node.name, params: init.params, body: init.body };
            }
            const unit = scope.unit;
            if (unit.active.has(node.name)) return fail(node, `${node.name} refers to itself`);
            unit.active.add(node.name);
            const value = unit.expression(init, rootScope(unit, true), out);
            unit.active.delete(node.name);
            return value;
        }
        case "import":
            return fail(node, `${node.name} is imported; kernels can only use helpers and constants defined in this module`);
        case "other":
            return fail(node, `${node.name} is not a module-scope const`);
    }
};

const identifier = (node: Identifier, scope: Scope, out: Out): Value => {
    const local = findLocal(scope, node.name);
    if (local !== undefined) return local.value;
    const binding = scope.unit.module.get(node.name);
    if (binding !== undefined) return moduleValue(node, binding, scope, out);
    switch (node.name) {
        case "Math": return { kind: "math" };
        case "Infinity": case "NaN": case "undefined": return scalarValue(node.name);
        default: return fail(node, `${node.name} is not defined in the kernel`);
    }
};

/** Declares `let` locals for data's leaves, and returns them as data plus an assignment of other data to them. */
const temporaries = (data: Data, scope: Scope, out: Out): { readonly result: Data; readonly assign: (source: Data) => Out } => {
    const result = mapLeaves(data, () => fresh(scope.unit, "t"));
    const names = leavesOf(result).map(leaf => leaf.code);
    out.push(`let ${names.join(", ")};`);
    return { result, assign: source => leavesOf(source).map((leaf, index) => assignment(scope.unit, "", names[index], leaf.code)) };
};

/** `test ? a : b` over any matching shapes. Branches that emit statements become an `if`. */
const conditional = (node: ConditionalExpression, scope: Scope, out: Out): Value => {
    const unit = scope.unit;
    let test = scalar(unit.expression(node.test, scope, out), node.test, scope);
    const consequentOut: Out = [];
    const alternateOut: Out = [];
    const consequent = toData(unit.expression(node.consequent, scope, consequentOut), node.consequent, scope);
    const alternate = toData(unit.expression(node.alternate, scope, alternateOut), node.alternate, scope);
    if (!sameShape(consequent, alternate)) return fail(node, "both branches must have the same shape");
    if (consequentOut.length === 0 && alternateOut.length === 0) {
        if (consequent.kind !== "leaf" && !isTrivial(test)) {
            const name = fresh(unit, "test");
            out.push(`const ${name} = ${test};`);
            test = name;
        }
        const alternateLeaves = leavesOf(alternate);
        let index = 0;
        return dataValue(mapLeaves(consequent, code => `(${test} ? ${code} : ${alternateLeaves[index++]?.code})`));
    }
    const { result, assign } = temporaries(consequent, scope, out);
    out.push(`if (${test}) {`, ...consequentOut, ...assign(consequent), "} else {", ...alternateOut, ...assign(alternate), "}");
    return dataValue(result);
};

/** `a && b`, `a || b`, `a ?? b`. A right side that emits statements runs only when needed. */
const logical = (node: LogicalExpression, scope: Scope, out: Out): Value => {
    const unit = scope.unit;
    const left = scalar(unit.expression(node.left, scope, out), node.left, scope);
    const rightOut: Out = [];
    const right = scalar(unit.expression(node.right, scope, rightOut), node.right, scope);
    if (rightOut.length === 0) return scalarValue(`(${left} ${node.operator} ${right})`);
    const name = fresh(unit, "t");
    const condition = node.operator === "&&" ? name : node.operator === "||" ? `!${name}` : `${name} == null`;
    out.push(assignment(unit, "let ", name, left), `if (${condition}) {`, ...rightOut, assignment(unit, "", name, right), "}");
    return scalarValue(name);
};

const literal = (node: Extract<Node, { type: "Literal" }>): Value => {
    if (typeof node.value === "number") return scalarValue(node.raw ?? String(node.value));
    if (typeof node.value === "boolean" || node.value === null) return scalarValue(String(node.value));
    return fail(node, "only number, boolean and null literals are in the kernel subset");
};

/** Compiles an expression to a value, emitting any statements it needs into `out`. */
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
            if (!unaryOperators.has(node.operator)) return fail(node, `${node.operator} is not in the kernel subset`);
            return scalarValue(`(${node.operator}${scalar(expression(node.argument, scope, out), node.argument, scope)})`);
        case "BinaryExpression": {
            if (node.operator === "in" || node.operator === "instanceof" || node.left.type === "PrivateIdentifier") {
                return fail(node, `${node.operator} is not in the kernel subset`);
            }
            const left = scalar(expression(node.left, scope, out), node.left, scope);
            const right = scalar(expression(node.right, scope, out), node.right, scope);
            // Strict equality tells true from 1, so boolean reads are converted here.
            const strict = node.operator === "===" || node.operator === "!==";
            return scalarValue(strict ? `(${observe(scope.unit, left)} ${node.operator} ${observe(scope.unit, right)})` : `(${left} ${node.operator} ${right})`);
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
