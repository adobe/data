import type { Path, Program } from '../world/create/kernel.js';
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

const unwrap = (node: Expression): Expression => node.kind === "observe" ? unwrap(node.value) : node;

type Guards = ReadonlySet<number>;
const union = (a: Guards, b: Guards): Guards => new Set([...a, ...b]);
const none: Guards = new Set();

/**
 * Derives a `Program` from the lowered body, or null if it uses what WASM kernels don't support. Locals are renumbered
 * densely, branch labels become depths counting enclosing blocks and loops, and each lookup call site gets a handle.
 * A lookup result may only be null-tested or read by a static leaf access; a non-optional access must be under a
 * guard proving the lookup found its entity, since JS would throw where WASM reads NaN. With `nameOf`, the program
 * carries each local's name.
 */
export const toProgram = (statements: readonly Statement[], nameOf?: (local: number) => string, accumulators: readonly number[] = []): Program | null => {
    const locals = new Map<number, number>();
    const localIndex = (local: number): number => {
        const existing = locals.get(local);
        if (existing !== undefined) return existing;
        locals.set(local, locals.size);
        return locals.size - 1;
    };
    /** Handles by the local holding a lookup result. */
    const handles = new Map<number, number>();
    const handleOf = (node: Expression): number | undefined => {
        const inner = unwrap(node);
        return inner.kind === "local" ? handles.get(inner.local) : undefined;
    };
    const isNull = (node: Expression): boolean => {
        const inner = unwrap(node);
        return inner.kind === "nullish" && inner.value === "null";
    };
    /** `handle` and whether the test means "found", for `other !== null` and its variants. */
    const nullTest = (node: Expression): { readonly handle: number; readonly found: boolean } | undefined => {
        if (node.kind !== "binary" || !["===", "!==", "==", "!="].includes(node.operator)) return undefined;
        const handle = isNull(node.right) ? handleOf(node.left) : isNull(node.left) ? handleOf(node.right) : undefined;
        return handle === undefined ? undefined : { handle, found: node.operator === "!==" || node.operator === "!=" };
    };
    /** Handles a test proves found when it is `truthy`. */
    const proves = (node: Expression, truthy: boolean): Guards => {
        const inner = unwrap(node);
        const handle = handleOf(inner);
        if (handle !== undefined) return truthy ? new Set([handle]) : none;
        const test = nullTest(inner);
        if (test !== undefined) return test.found === truthy ? new Set([test.handle]) : none;
        if (inner.kind === "unary" && inner.operator === "!") return proves(inner.operand, !truthy);
        if (inner.kind === "logical" && inner.operator === (truthy ? "&&" : "||")) return union(proves(inner.left, truthy), proves(inner.right, truthy));
        return none;
    };
    /** A static leaf access into a lookup result, or undefined if `node` isn't one. */
    const leaf = (node: Expression, guards: Guards): Program.Expression | null | undefined => {
        const keys: Expression[] = [];
        let first: Expression = node;
        let optional = false;
        while (first.kind === "element") {
            keys.unshift(first.index);
            optional = first.optional;
            first = first.object;
        }
        const handle = handleOf(first);
        if (handle === undefined) return undefined;
        const [read, ...rest] = keys;
        if (read?.kind !== "number" || (!optional && !guards.has(handle))) return null;
        const path: (number | string)[] = [];
        for (const key of rest) {
            if (key.kind !== "number" && key.kind !== "string") return null;
            path.push(key.value);
        }
        const leafPath: Path = path;
        return { kind: "lookupLeaf", handle, read: read.value, path: leafPath };
    };
    /** `test` is set where only truthiness matters, so a lookup result may stand for `found`. */
    const expression = (node: Expression, guards: Guards, test: boolean): Program.Expression | undefined => {
        const handle = handleOf(node);
        if (handle !== undefined) return test ? { kind: "found", handle } : undefined;
        const check = nullTest(node);
        if (check !== undefined) {
            const found: Program.Expression = { kind: "found", handle: check.handle };
            return check.found ? found : { kind: "unary", operator: "!", operand: found };
        }
        switch (node.kind) {
            case "number": case "boolean": case "column": case "resource": case "args":
                return node;
            case "local": return { kind: "local", local: localIndex(node.local) };
            case "unary": {
                const operand = expression(node.operand, guards, node.operator === "!");
                return operand && { kind: "unary", operator: node.operator, operand };
            }
            case "binary": {
                const left = expression(node.left, guards, false);
                const right = expression(node.right, guards, false);
                return left && right && { kind: "binary", operator: node.operator, left, right };
            }
            case "logical": {
                if (node.operator === "??") return undefined;
                const left = expression(node.left, guards, test);
                const right = expression(node.right, node.operator === "&&" ? union(guards, proves(node.left, true)) : union(guards, proves(node.left, false)), test);
                return left && right && { kind: "logical", operator: node.operator, left, right };
            }
            case "conditional": {
                const condition = expression(node.test, guards, true);
                const consequent = expression(node.consequent, union(guards, proves(node.test, true)), test);
                const alternate = expression(node.alternate, union(guards, proves(node.test, false)), test);
                return condition && consequent && alternate && { kind: "conditional", test: condition, consequent, alternate };
            }
            case "math": {
                const items = all(node.arguments, item => expression(item, guards, false));
                return items && { kind: "math", name: node.name, arguments: items };
            }
            case "observe": return expression(node.value, guards, test);
            case "lane": {
                const value = expression(node.value, guards, false);
                return value && { kind: "lane", intrinsic: node.intrinsic, lane: node.lane, value };
            }
            case "element": return leaf(node, guards) ?? undefined;
            default: return undefined;
        }
    };
    let intrinsics = 0;
    const exits = (body: readonly Statement[]): boolean => body[body.length - 1]?.kind === "next";
    const block = (body: readonly Statement[], labels: readonly number[], outer: Guards): Program.Statement[] | undefined => {
        let guards = outer;
        const result: Program.Statement[] = [];
        for (const item of body) {
            const converted = statement(item, labels, guards);
            if (converted === undefined) return undefined;
            result.push(...converted);
            // `if (other === null) return;` guards the rest of the block.
            if (item.kind === "if") {
                if (exits(resolve(item.consequent))) guards = union(guards, proves(item.test, false));
                if (exits(resolve(item.alternate))) guards = union(guards, proves(item.test, true));
            }
        }
        return result;
    };
    const depth = (label: number, labels: readonly number[]): number => labels.length - 1 - labels.lastIndexOf(label);
    const statement = (node: Statement, labels: readonly number[], guards: Guards): Program.Statement[] | undefined => {
        switch (node.kind) {
            case "set": {
                const value = expression(node.value, guards, false);
                return value && [{ kind: "set", local: localIndex(node.local), value }];
            }
            case "declare":
                for (const item of node.locals) localIndex(item);
                return [];
            case "store": {
                const value = expression(node.value, guards, false);
                return value && [{ kind: "store", column: node.column, value }];
            }
            case "stamp": case "next":
                return [node];
            case "if": {
                const test = expression(node.test, guards, true);
                const consequent = block(resolve(node.consequent), labels, union(guards, proves(node.test, true)));
                const alternate = block(resolve(node.alternate), labels, union(guards, proves(node.test, false)));
                return test && consequent && alternate && [{ kind: "if", test, consequent, alternate }];
            }
            case "block": case "loop": {
                const body = block(resolve(node.body), [...labels, node.label], guards);
                return body && [{ kind: node.kind, body }];
            }
            case "branch": return [{ kind: "branch", depth: depth(node.label, labels) }];
            case "intrinsic": {
                const operands = all(node.operands, lanes => all(lanes, lane => expression(lane, guards, false)));
                const body = block(resolve(node.body), labels, guards);
                intrinsics = Math.max(intrinsics, node.id + 1);
                return operands && body && [{ kind: "intrinsic", id: node.id, name: node.name, intrinsic: node.intrinsic, operands, body }];
            }
            case "branchIf": {
                const test = expression(node.test, guards, true);
                return test && [{ kind: "branchIf", depth: depth(node.label, labels), test }];
            }
            case "lookup": {
                const entity = expression(node.entity, guards, false);
                const handle = handles.get(node.local) ?? handles.size;
                handles.set(node.local, handle);
                return entity && [{ kind: "find", handle, lookup: node.lookup, entity }];
            }
            default: return undefined;
        }
    };
    const body = block(statements, [], none);
    if (body === undefined) return null;
    const counted = { ...intrinsics === 0 ? {} : { intrinsics }, ...accumulators.length === 0 ? {} : { reductions: accumulators.map(localIndex) } };
    if (nameOf === undefined) return { locals: locals.size, handles: handles.size, ...counted, body };
    const names: string[] = [];
    for (const [original, dense] of locals) names[dense] = nameOf(original);
    return { locals: locals.size, handles: handles.size, names, ...counted, body };
};
