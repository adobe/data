// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Loop protection, as playgrounds give it: a run's frame shares the guide's thread, so a loop or a recursion that never
 * ends would freeze the page. Each compiled module, the ECS build's output, gets a check at the start of every loop's
 * body and every function's, which throws once the task it runs in has run for too long (`run/guard.ts`). Kernels are
 * compiled from the body as written, before this, and run on workers, so neither the build's input nor its kernels
 * hold a check.
 */

/** The specifier compiled modules import the checks from, which a run's import map sends to its exports. */
export const guardModule = "@ecs-guide/guard";

/** A node of an ESTree program, with its place in the code. */
type Node = { readonly type: string; readonly start: number; readonly end: number; readonly [key: string]: unknown };

const isNode = (value: unknown): value is Node =>
    typeof value === "object" && value !== null && typeof Reflect.get(value, "type") === "string"
    && typeof Reflect.get(value, "start") === "number" && typeof Reflect.get(value, "end") === "number";

const loops: ReadonlySet<string> = new Set(["ForStatement", "ForInStatement", "ForOfStatement", "WhileStatement", "DoWhileStatement"]);
const functions: ReadonlySet<string> = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);

/** Text put in at an offset of the code. */
type Insertion = { readonly at: number; readonly text: string };

/** Each node within `value`, depth first. */
const visit = (value: unknown, each: (node: Node) => void): void => {
    if (Array.isArray(value)) {
        for (const item of value) visit(item, each);
        return;
    }
    if (typeof value !== "object" || value === null) return;
    if (isNode(value)) each(value);
    for (const key of Object.keys(value)) {
        if (key !== "type" && key !== "start" && key !== "end") visit(Reflect.get(value, key), each);
    }
};

/** Puts `check()` first in a body: inside a block, or in one made around a single statement or an arrow's expression. */
const guarded = (body: Node, check: string, expression: boolean): readonly Insertion[] => {
    if (body.type === "BlockStatement") return [{ at: body.start + 1, text: ` ${check}();` }];
    return expression
        ? [{ at: body.start, text: `(${check}(), ` }, { at: body.end, text: ")" }]
        : [{ at: body.start, text: `{ ${check}(); ` }, { at: body.end, text: " }" }];
};

/**
 * `code` with its loops and functions checked, the checks imported on its first line so its lines stay where they
 * were. `parse` gives its ESTree program, whose offsets count UTF-16 code units, as `offset` makes them from what it
 * gives.
 */
export const protect = (code: string, parse: (code: string) => unknown, offset: (code: string, at: number) => number = (_code, at) => at): string => {
    const insertions: Insertion[] = [];
    visit(parse(code), node => {
        const body: unknown = Reflect.get(node, "body");
        if (!isNode(body)) return;
        if (loops.has(node.type)) insertions.push(...guarded(body, "__guideLoop", false));
        else if (functions.has(node.type)) insertions.push(...guarded(body, "__guideCall", node.type === "ArrowFunctionExpression" && body.type !== "BlockStatement"));
    });
    if (insertions.length === 0) return code;
    const placed = insertions.map(insertion => ({ at: offset(code, insertion.at), text: insertion.text })).sort((a, b) => b.at - a.at);
    let protectedCode = code;
    for (const { at, text } of placed) protectedCode = `${protectedCode.slice(0, at)}${text}${protectedCode.slice(at)}`;
    return `import { loopGuard as __guideLoop, callGuard as __guideCall } from ${JSON.stringify(guardModule)}; ${protectedCode}`;
};
