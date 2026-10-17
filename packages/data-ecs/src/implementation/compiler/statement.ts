import type { DoWhileStatement, Expression, ForStatement, Node, WhileStatement } from 'estree';
import { assign, update } from './assign.js';
import { bind } from './bind.js';
import { fail } from './failure.js';
import { not } from './ir.js';
import type { Out } from './out.js';
import { scalar } from './scalar.js';
import { childScope, type Scope } from './scope.js';
import { label } from './unit.js';

/** The label of the JS row loop; `next` continues it. */
export const rowLabel = "rows";

const expressionStatement = (node: Expression, scope: Scope, out: Out): void => {
    switch (node.type) {
        case "AssignmentExpression": return assign(node, scope, out);
        case "UpdateExpression": return update(node, scope, out);
        case "SequenceExpression": return node.expressions.forEach(item => expressionStatement(item, scope, out));
        default: scope.unit.expression(node, scope, out);
    }
};

/** Exits the loop's block when `node` is false. */
const test = (node: Expression, exit: number, scope: Scope, out: Out): void => {
    out.push({ kind: "branchIf", label: exit, test: not(scalar(scope.unit.expression(node, scope, out), node, scope)) });
};

/**
 * Every loop compiles to `block exit { loop repeat { test; block next { body } update; branch repeat } }`, so a test
 * that emits statements is re-evaluated each iteration, `break` exits `exit`, and `continue` exits `next` and still
 * runs the update.
 */
const loop = (node: ForStatement | WhileStatement | DoWhileStatement, scope: Scope, out: Out): void => {
    const outer = childScope(scope);
    if (node.type === "ForStatement" && node.init) {
        if (node.init.type === "VariableDeclaration") statement(node.init, outer, out);
        else expressionStatement(node.init, outer, out);
    }
    const unit = scope.unit;
    const exit = label(unit);
    const repeat = label(unit);
    const next = label(unit);
    const head: Out = [];
    const tail: Out = [];
    if (node.type !== "DoWhileStatement" && node.test) test(node.test, exit, outer, head);
    const body: Out = [];
    statement(node.body, childScope(outer, { exit, next }), body);
    if (node.type === "ForStatement" && node.update) expressionStatement(node.update, outer, tail);
    if (node.type === "DoWhileStatement") test(node.test, exit, outer, tail);
    out.push({
        kind: "block", label: exit, body: [{
            kind: "loop", label: repeat,
            body: [...head, { kind: "block", label: next, body }, ...tail, { kind: "branch", label: repeat }],
        }],
    });
};

/** Compiles a statement of the kernel subset. */
export const statement = (node: Node, scope: Scope, out: Out): void => {
    switch (node.type) {
        case "VariableDeclaration":
            if (node.kind !== "const" && node.kind !== "let") return fail(node, `use const or let, not ${node.kind}`);
            for (const declarator of node.declarations) {
                if (!declarator.init) return fail(declarator, "locals need an initializer");
                const value = scope.unit.expression(declarator.init, scope, out);
                bind(declarator.id, value, node.kind, scope, out);
            }
            return;
        case "ExpressionStatement":
            return expressionStatement(node.expression, scope, out);
        case "BlockStatement": {
            const inner = childScope(scope);
            for (const item of node.body) statement(item, inner, out);
            return;
        }
        case "IfStatement": {
            const condition = scalar(scope.unit.expression(node.test, scope, out), node.test, scope);
            const consequent: Out = [];
            const alternate: Out = [];
            statement(node.consequent, childScope(scope), consequent);
            if (node.alternate) statement(node.alternate, childScope(scope), alternate);
            out.push({ kind: "if", test: condition, consequent, alternate });
            return;
        }
        case "ForStatement": case "WhileStatement": case "DoWhileStatement":
            return loop(node, scope, out);
        case "BreakStatement": case "ContinueStatement":
            if (node.label) return fail(node, "labels are not in the kernel subset");
            if (scope.loop === undefined) return fail(node, `${node.type === "BreakStatement" ? "break" : "continue"} outside a loop`);
            out.push({ kind: "branch", label: node.type === "BreakStatement" ? scope.loop.exit : scope.loop.next });
            return;
        case "ReturnStatement":
            if (scope.helper) return fail(node, "a helper can only return at its end");
            if (node.argument) return fail(node, "a kernel returns nothing; return ends the current row");
            out.push({ kind: "next" });
            return;
        case "EmptyStatement":
            return;
        default:
            return fail(node, `${node.type} is not in the kernel subset`);
    }
};
