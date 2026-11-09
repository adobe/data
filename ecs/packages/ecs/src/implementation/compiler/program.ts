// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Path, Program } from '../world/kernel.js';
import type { Expression, Statement } from './ir.js';
import { resolve } from './out.js';
import { simplifyProgram } from './simplify-program.js';

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
/** The handle standing for `up`, which isn't looked up. */
const upHandle = -1;
/** The guard that the entity found into `handle` holds its lookup's optional read `read`: negative, below `upHandle`. */
const holdsGuard = (handle: number, read: number): number => -2 - handle * 1024 - read;

/**
 * Derives a `Program` from the lowered body, or null if it uses what WASM kernels don't support. Locals are renumbered
 * densely, branch labels become depths counting enclosing blocks and loops, and each lookup call site gets a handle.
 * A lookup result may only be null-tested or read by a static leaf access; a non-optional access must be under a
 * guard proving the lookup found its entity, since JS would throw where WASM reads NaN. With `nameOf`, the program
 * carries each local's name.
 */
export const toProgram = (statements: readonly Statement[], nameOf?: (local: number) => string, accumulators: readonly number[] = [], upLocal: number | null = null, listed = upLocal !== null, optionalReads: (lookup: number) => ReadonlySet<number> = () => new Set()): Program | null => {
    const locals = new Map<number, number>();
    const localIndex = (local: number): number => {
        const existing = locals.get(local);
        if (existing !== undefined) return existing;
        locals.set(local, locals.size);
        return locals.size - 1;
    };
    /** Handles by the local holding a lookup result. */
    const handles = new Map<number, number>();
    /** By handle of a lookup by entity, its lookup. */
    const lookupOf = new Map<number, number>();
    /**
     * Locals holding a component a lookup found, `const three = found[data]`: the lookup result and the static keys
     * into it, which a read through the local continues.
     */
    const aliases = new Map<number, { readonly root: Expression; readonly keys: readonly Expression[] }>();
    /** A static access into a lookup result, through aliases: the handle and its keys, or undefined if `node` isn't one. */
    const accessOf = (node: Expression): { readonly handle: number; readonly keys: readonly Expression[]; readonly optional: boolean } | undefined => {
        const keys: Expression[] = [];
        let first: Expression = unwrap(node);
        let optional = false;
        for (;;) {
            if (first.kind === "element") {
                keys.unshift(first.index);
                optional ||= first.optional;
                first = unwrap(first.object);
                continue;
            }
            const alias = first.kind === "local" ? aliases.get(first.local) : undefined;
            if (alias === undefined) break;
            keys.unshift(...alias.keys);
            first = unwrap(alias.root);
        }
        const handle = handleOf(first);
        return handle === undefined || keys.length === 0 ? undefined : { handle, keys, optional };
    };
    /** The handle and read of a component an entity found may lack, `found[data]` or a local holding it. */
    const optionalRead = (node: Expression): { readonly handle: number; readonly read: number } | undefined => {
        const access = accessOf(node);
        const [read] = access?.keys ?? [];
        if (access === undefined || access.keys.length !== 1 || read?.kind !== "number") return undefined;
        const lookup = lookupOf.get(access.handle);
        return lookup !== undefined && optionalReads(lookup).has(read.value) ? { handle: access.handle, read: read.value } : undefined;
    };
    /** How many times each local is assigned, over every statement. */
    const assignments = new Map<number, number>();
    const countAssignments = (body: readonly Statement[]): void => {
        for (const item of body) {
            if (item.kind === "set") assignments.set(item.local, (assignments.get(item.local) ?? 0) + 1);
            else if (item.kind === "if") { countAssignments(resolve(item.consequent)); countAssignments(resolve(item.alternate)); }
            else if (item.kind === "block" || item.kind === "loop" || item.kind === "intrinsic") countAssignments(resolve(item.body));
        }
    };
    countAssignments(statements);
    const isUndefined = (node: Expression): boolean => {
        const inner = unwrap(node);
        return inner.kind === "nullish" && inner.value === "undefined";
    };
    /** `found[data] !== undefined` and its variants: the optional read and whether the test means "holds it". */
    const holdsTest = (node: Expression): { readonly handle: number; readonly read: number; readonly holds: boolean } | undefined => {
        if (node.kind !== "binary" || !["===", "!==", "==", "!="].includes(node.operator)) return undefined;
        const tested = isUndefined(node.right) ? optionalRead(node.left) : isUndefined(node.left) ? optionalRead(node.right) : undefined;
        return tested === undefined ? undefined : { ...tested, holds: node.operator === "!==" || node.operator === "!=" };
    };
    const handleOf = (node: Expression): number | undefined => {
        const inner = unwrap(node);
        // A row a lookup through an index gave tests as found, as a lookup's result does.
        if (inner.kind === "rowFound") return handleFor(inner.row);
        return inner.kind !== "local" ? undefined : inner.local === upLocal ? upHandle : handles.get(inner.local);
    };
    /** The handle of a local holding a lookup through an index's list or row, made at its first use. */
    const handleFor = (local: number): number => {
        const existing = handles.get(local);
        if (existing !== undefined) return existing;
        handles.set(local, handles.size);
        return handles.size - 1;
    };
    /** Whether `handle` found its entity, or for `up`, whether the call's rows have a parent. */
    const found = (handle: number): Program.Expression => handle === upHandle ? { kind: "upFound" } : { kind: "found", handle };
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
        const held = optionalRead(inner);
        if (held !== undefined) return truthy ? new Set([held.handle, holdsGuard(held.handle, held.read)]) : none;
        const holds = holdsTest(inner);
        if (holds !== undefined) return holds.holds === truthy ? new Set([holds.handle, holdsGuard(holds.handle, holds.read)]) : none;
        if (inner.kind === "unary" && inner.operator === "!") return proves(inner.operand, !truthy);
        if (inner.kind === "logical" && inner.operator === (truthy ? "&&" : "||")) return union(proves(inner.left, truthy), proves(inner.right, truthy));
        return none;
    };
    /** A static leaf access into a lookup result, or undefined if `node` isn't one. */
    const leaf = (node: Expression, guards: Guards): Program.Expression | null | undefined => {
        const access = accessOf(node);
        if (access === undefined) return undefined;
        const { handle, keys, optional } = access;
        if (handle === upHandle) return null;
        const [read, ...rest] = keys;
        if (read?.kind !== "number" || (!optional && !guards.has(handle))) return null;
        // A component the entity may lack is read only where a test proves it holds it, since JS throws reading into undefined.
        const lookup = lookupOf.get(handle);
        if (lookup !== undefined && optionalReads(lookup).has(read.value) && !guards.has(holdsGuard(handle, read.value))) return null;
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
        if (handle !== undefined) return test ? found(handle) : undefined;
        const check = nullTest(node);
        if (check !== undefined) {
            const tested = found(check.handle);
            return check.found ? tested : { kind: "unary", operator: "!", operand: tested };
        }
        const held = test ? optionalRead(node) : undefined;
        if (held !== undefined) return { kind: "lookupHas", handle: held.handle, read: held.read };
        const holds = holdsTest(node);
        if (holds !== undefined) {
            const tested: Program.Expression = { kind: "lookupHas", handle: holds.handle, read: holds.read };
            return holds.holds ? tested : { kind: "unary", operator: "!", operand: tested };
        }
        switch (node.kind) {
            case "number": case "boolean": case "column": case "resource": case "args": case "shared":
                return node;
            // WASM runs only archetypes with every optional component; the others run the JS kernel.
            case "present": return { kind: "boolean", value: true };
            // JS throws reading a parent that isn't there, so WASM reads one only where a test proves it is.
            case "upColumn": return guards.has(upHandle) ? { kind: "upLeaf", column: node.column } : undefined;
            // A local holding a found component reads as the result does: a scalar one as itself, a struct through its leaves.
            case "local": return aliases.has(node.local) ? leaf(node, guards) ?? undefined : { kind: "local", local: localIndex(node.local) };
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
            case "resourceElement": {
                const element = expression(node.element, guards, false);
                return element && { kind: "resourceElement", index: node.index, element };
            }
            // A row's leaves read NaN where there's no row, in JS kernels as in WASM, so they need no guard.
            case "listLength": return { kind: "listLength", handle: handleFor(node.list) };
            case "listChanged": return { kind: "listChanged", handle: handleFor(node.list) };
            case "rowLeaf": return { kind: "rowLeaf", handle: handleFor(node.row), leaf: node.leaf };
            case "rowEntity": return { kind: "rowEntity", handle: handleFor(node.row) };
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
                // A component a lookup found, held whole, is read through the local as through the result.
                const access = accessOf(node.value);
                if (access !== undefined && access.handle !== upHandle && access.keys.length === 1 && assignments.get(node.local) === 1) {
                    aliases.set(node.local, { root: unwrap(node.value).kind === "element" ? unwrap(node.value) : node.value, keys: [] });
                    return [];
                }
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
            case "resourceStore": {
                const element = expression(node.element, guards, false);
                const value = expression(node.value, guards, false);
                return element && value && [{ kind: "resourceStore", index: node.index, element, value }];
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
            case "probe": {
                const values = all(node.values, item => expression(item, guards, false));
                return values && [{ kind: "probe", list: handleFor(node.list), first: handleFor(node.first), probe: node.probe, values }];
            }
            case "listRow": {
                const index = expression(node.index, guards, false);
                return index && [{ kind: "listRow", row: handleFor(node.row), list: handleFor(node.list), index }];
            }
            case "lookup": {
                const entity = expression(node.entity, guards, false);
                const handle = handles.get(node.local) ?? handles.size;
                handles.set(node.local, handle);
                lookupOf.set(handle, node.lookup);
                return entity && [{ kind: "find", handle, lookup: node.lookup, entity }];
            }
            default: return undefined;
        }
    };
    const body = block(statements, [], none);
    if (body === undefined) return null;
    const counted = { ...intrinsics === 0 ? {} : { intrinsics }, ...accumulators.length === 0 ? {} : { reductions: accumulators.map(localIndex) } };
    if (listed) Object.assign(counted, { up: true });
    if (nameOf === undefined) return simplifyProgram({ locals: locals.size, handles: handles.size, ...counted, body });
    const names: string[] = [];
    for (const [original, dense] of locals) names[dense] = nameOf(original);
    return simplifyProgram({ locals: locals.size, handles: handles.size, names, ...counted, body });
};
