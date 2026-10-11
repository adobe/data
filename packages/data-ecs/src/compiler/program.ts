import type { Program } from '../world/create/kernel.js';
import type { Expression, Statement } from './ir.js';
import { resolve } from './out.js';

const all = <T, R>(items: readonly T[], map: (item: T) => R | undefined): R[] | undefined => {
    const result: R[] = [];
    for (const item of items) {
        const mapped = map(item);
        if (mapped === undefined) return undefined;
        result.push(mapped);
    }
    return result;
};

/**
 * Derives a `Program` from the lowered body, or null if it uses JS-only nodes. Locals are renumbered densely, and
 * branch labels become depths counting enclosing blocks and loops.
 */
export const toProgram = (statements: readonly Statement[]): Program | null => {
    const locals = new Map<number, number>();
    const localIndex = (local: number): number => {
        const existing = locals.get(local);
        if (existing !== undefined) return existing;
        locals.set(local, locals.size);
        return locals.size - 1;
    };
    const expression = (node: Expression): Program.Expression | undefined => {
        switch (node.kind) {
            case "number": case "boolean": case "column": case "resource": case "args":
                return node;
            case "local": return { kind: "local", local: localIndex(node.local) };
            case "unary": {
                const operand = expression(node.operand);
                return operand && { kind: "unary", operator: node.operator, operand };
            }
            case "binary": case "logical": {
                const left = expression(node.left);
                const right = expression(node.right);
                if (left === undefined || right === undefined) return undefined;
                if (node.kind === "binary") return { kind: "binary", operator: node.operator, left, right };
                return node.operator === "??" ? undefined : { kind: "logical", operator: node.operator, left, right };
            }
            case "conditional": {
                const [test, consequent, alternate] = all([node.test, node.consequent, node.alternate], expression) ?? [];
                return test && consequent && alternate && { kind: "conditional", test, consequent, alternate };
            }
            case "math": {
                const items = all(node.arguments, expression);
                return items && { kind: "math", name: node.name, arguments: items };
            }
            case "observe": return expression(node.value);
            default: return undefined;
        }
    };
    const block = (body: readonly Statement[], labels: readonly number[]): Program.Statement[] | undefined =>
        all(body, item => statement(item, labels))?.flat();
    const depth = (label: number, labels: readonly number[]): number => labels.length - 1 - labels.lastIndexOf(label);
    const statement = (node: Statement, labels: readonly number[]): Program.Statement[] | undefined => {
        switch (node.kind) {
            case "set": {
                const value = expression(node.value);
                return value && [{ kind: "set", local: localIndex(node.local), value }];
            }
            case "declare":
                for (const item of node.locals) localIndex(item);
                return [];
            case "store": {
                const value = expression(node.value);
                return value && [{ kind: "store", column: node.column, value }];
            }
            case "stamp": case "next":
                return [node];
            case "if": {
                const test = expression(node.test);
                const consequent = block(resolve(node.consequent), labels);
                const alternate = block(resolve(node.alternate), labels);
                return test && consequent && alternate && [{ kind: "if", test, consequent, alternate }];
            }
            case "block": case "loop": {
                const body = block(resolve(node.body), [...labels, node.label]);
                return body && [{ kind: node.kind, body }];
            }
            case "branch": return [{ kind: "branch", depth: depth(node.label, labels) }];
            case "branchIf": {
                const test = expression(node.test);
                return test && [{ kind: "branchIf", depth: depth(node.label, labels), test }];
            }
            default: return undefined;
        }
    };
    const body = block(statements, []);
    return body === undefined ? null : { locals: locals.size, body };
};
