// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Expression, Node, ObjectExpression, Program as Estree, SimpleCallExpression, SpreadElement } from 'estree';
import { layoutOf, samePath, type Layout } from '../../interface/registry/layout.js';
import type { Schema } from '../../interface/schema/schema.js';
import type { Program } from '../world/kernel.js';
import { generateWasmOrReason, type Type, type WasmColumn, type WasmLookup, type WasmScalar } from '../world/wasm.js';
import { generateWgsl, type ScalarKind } from '../world/wgsl.js';
import { usedBy } from './body-access.js';
import type { CompiledKernel, KernelExplanation } from './compile-kernel.js';
import { children, isFunction } from './estree.js';
import { failureOf, type Failure } from './failure.js';
import type { Expression as IrExpression, Statement as IrStatement } from './ir.js';
import { createLists } from './lists.js';
import { resolve } from './out.js';
import { kernelOf } from './signature.js';
import { createdBy, functionOf, literalOf, positionsOf, type TransformedSites } from './transform.js';
import { printWat } from './wat.js';

/**
 * What one backend gives a system: the code it compiles to; code it would compile to if declared so, and how;
 * code the world generates when it registers the system, from what the build can't see; or why there's none.
 */
export type Backend =
    | { readonly kind: "compiled"; readonly code: string }
    | { readonly kind: "eligible"; readonly code: string; readonly reason: string }
    | { readonly kind: "registration"; readonly reason: string }
    | { readonly kind: "none"; readonly reason: string };

/**
 * What runs a system: over every matched row, once per run, as an observer, on one entity its input names (`target`),
 * or as a render system.
 */
export type SystemKind = "row" | "per-run" | "observer" | "target" | "render";

/**
 * A system of a module as the build compiles it: its call's offsets in the code transformed, the binding it's
 * assigned to, its kind and `kernel`, what runs it by default and where, and what each backend gives it.
 */
export type DescribedSystem = {
    readonly start: number;
    readonly end: number;
    readonly binding: string | null;
    readonly kind: SystemKind;
    readonly kernel: boolean | "gpu" | null;
    readonly runs: string;
    readonly js: Backend;
    readonly wasm: Backend;
    readonly wgsl: Backend;
};

/** What a module declares of a key: its type's schema, and the thread it's placed on. */
type Declared = { readonly schema: Schema | undefined; readonly thread: string | null };

/** A literal's value, as the build writes schemas: JSON, with `NaN`, `Infinity` and negated numbers. */
const valueOf = (node: Node): unknown => {
    switch (node.type) {
        case "Literal": return node.value;
        case "Identifier": return node.name === "NaN" ? NaN : node.name === "Infinity" ? Infinity : node.name === "undefined" ? undefined : null;
        case "UnaryExpression": {
            const operand = valueOf(node.argument);
            return node.operator === "-" && typeof operand === "number" ? -operand : null;
        }
        case "ArrayExpression": return node.elements.map(element => element === null ? null : valueOf(element));
        case "ObjectExpression": {
            const object: { [field: string]: unknown } = {};
            for (const property of node.properties) {
                if (property.type !== "Property") continue;
                const key = property.key.type === "Identifier" && !property.computed ? property.key.name : property.key.type === "Literal" ? String(property.key.value) : null;
                if (key !== null) object[key] = valueOf(property.value);
            }
            return object;
        }
        default: return null;
    }
};

const isSchema = (value: unknown): value is Schema => typeof value === "object" && value !== null && !Array.isArray(value);

/** A property of an object literal written out, by name. */
const propertyOf = (object: ObjectExpression, name: string): Node | null => {
    for (const property of object.properties) {
        if (property.type === "Property" && !property.computed && property.key.type === "Identifier" && property.key.name === name) return property.value;
    }
    return null;
};

/**
 * Each key the module registers, by its binding: the calls the input pass appends (`augmentations.ts`), to a function
 * of the module taking `key, kind, declaration`.
 */
const declarationsIn = (program: Estree): ReadonlyMap<string, Declared> => {
    const recorders = new Set<string>();
    for (const statement of program.body) {
        if (statement.type !== "FunctionDeclaration" || statement.id === null) continue;
        const names = statement.params.map(param => param.type === "Identifier" ? param.name : "");
        if (names.join() === "key,kind,declaration") recorders.add(statement.id.name);
    }
    const found = new Map<string, Declared>();
    for (const statement of program.body) {
        if (statement.type !== "ExpressionStatement" || statement.expression.type !== "CallExpression") continue;
        const { callee, arguments: [key, kind, declaration] } = statement.expression;
        if (callee.type !== "Identifier" || !recorders.has(callee.name) || key?.type !== "Identifier" || kind?.type !== "Literal" || typeof kind.value !== "string") continue;
        const object = declaration?.type === "ObjectExpression" ? declaration : null;
        const type = object === null ? null : propertyOf(object, "type");
        const schema = type === null ? undefined : valueOf(type);
        const thread = object === null ? null : propertyOf(object, "thread");
        found.set(key.name, {
            schema: isSchema(schema) ? schema : undefined,
            thread: thread?.type === "Literal" && typeof thread.value === "string" ? thread.value : null,
        });
    }
    return found;
};

/** Each call's binding: the name a `const` or `let` declares with it, or with a call wrapping it. */
const bindingsIn = (program: Estree): ReadonlyMap<Node, string> => {
    const found = new Map<Node, string>();
    const visit = (node: Node): void => {
        if (node.type === "VariableDeclarator" && node.id.type === "Identifier" && node.init !== null && node.init !== undefined) {
            found.set(node.init, node.id.name);
            if (node.init.type === "CallExpression") for (const argument of node.init.arguments) if (!found.has(argument)) found.set(argument, node.id.name);
        }
        for (const child of children(node)) visit(child);
    };
    visit(program);
    return found;
};

/** Why a kernel's statements have no program: the first thing in them WASM and the GPU can't run. */
const unprogrammable = (statements: readonly IrStatement[]): string => {
    const inExpression = (expression: IrExpression): string | null => {
        switch (expression.kind) {
            case "string": return "it uses a string as a value, which kernels read only as keys";
            case "nullish": return `it uses ${expression.value} as a value, which WASM and the GPU have no value for`;
            case "array": case "record": return "it keeps a tuple or struct whole where WASM and the GPU need its leaves";
            case "element": return expression.index.kind === "number" || expression.index.kind === "string" ? inExpression(expression.object) : "it indexes a value at runtime, which WASM and the GPU index only statically";
            case "logical": return expression.operator === "??" ? "it uses ??, which WASM and the GPU have no null for" : inExpression(expression.left) ?? inExpression(expression.right);
            case "unary": return inExpression(expression.operand);
            case "binary": return inExpression(expression.left) ?? inExpression(expression.right);
            case "conditional": return inExpression(expression.test) ?? inExpression(expression.consequent) ?? inExpression(expression.alternate);
            case "math": for (const item of expression.arguments) { const found = inExpression(item); if (found !== null) return found; } return null;
            case "observe": return inExpression(expression.value);
            default: return null;
        }
    };
    const inStatements = (body: readonly IrStatement[]): string | null => {
        for (const statement of body) {
            switch (statement.kind) {
                case "spawn": case "begin": case "value": case "component": return "it issues commands, which WASM and the GPU don't";
                case "set": case "store": { const found = inExpression(statement.value); if (found !== null) return found; break; }
                case "if": { const found = inExpression(statement.test) ?? inStatements(resolve(statement.consequent)) ?? inStatements(resolve(statement.alternate)); if (found !== null) return found; break; }
                case "block": case "loop": { const found = inStatements(resolve(statement.body)); if (found !== null) return found; break; }
                default: break;
            }
        }
        return null;
    };
    return inStatements(statements) ?? "it reads a lookup's result, or `up`, without testing it against null first, which WASM needs";
};

/** The number of keys a declaration lists at `path`, read as the build reads lists; 0 without the list. */
const listLength = (declaration: ObjectExpression, path: readonly string[], count: (node: Node) => number): number => {
    let node: Node | null = declaration;
    for (const name of path) node = node?.type === "ObjectExpression" ? propertyOf(node, name) : null;
    return node === null ? 0 : count(node);
};

/** A scalar leaf's type in a layout, or null when the path names none. */
const leafType = (layout: Layout, path: readonly (number | string)[]): Type | null => {
    if (layout.kind !== "linear") return null;
    const leaf = layout.leaves.find(candidate => samePath(candidate.path, path));
    return leaf === undefined ? null : leaf.scalar === "boolean" ? "boolean" : "number";
};

/** What the columns and scalars of a kernel are where every component and resource it names is declared here, or why the build can't tell. */
type Placed = {
    readonly columns: readonly WasmColumn[];
    readonly upColumns: readonly WasmColumn[];
    readonly scalarType: (scalar: WasmScalar) => Type | null;
    /** How a GPU dispatch's record holds a scalar: a shared value's leaf keeps its type. */
    readonly scalarKind: (scalar: WasmScalar) => ScalarKind;
    readonly lookups: readonly WasmLookup[];
} | { readonly registration: string } | { readonly none: string };

/** The leading lowercase letter of a message, for one quoted after a clause. */
const clause = (message: string): string => /^[A-Z][a-z]/.test(message) ? `${message.charAt(0).toLowerCase()}${message.slice(1)}` : message;

/** Describes each system of a transformed module; `format` prints JavaScript readably. */
export const describeSystems = async (sites: TransformedSites, format: (code: string) => string): Promise<readonly DescribedSystem[]> => {
    const { program, module, locals } = sites;
    const declarations = declarationsIn(program);
    const bindings = bindingsIn(program);
    /** Layouts by key binding, made once; a schema the world would reject gives its reason. */
    const layouts = new Map<string, Layout | string>();
    const layoutNamed = (key: string): Layout | string | undefined => {
        const declared = declarations.get(key);
        if (declared === undefined) return undefined;
        let layout = layouts.get(key);
        if (layout === undefined) {
            try {
                layout = layoutOf(declared.schema);
            } catch (error) {
                layout = error instanceof Error ? error.message : String(error);
            }
            layouts.set(key, layout);
        }
        return layout;
    };
    /**
     * The components whose changes some system of the module observes, by a change filter or a lookup's: a kernel
     * stamps only those, as the world mutes the rest's ticks (`bindKernel` in `world/kernels.ts`), with every system here
     * registered.
     */
    const observed = new Set<string>();
    const observe = (node: Node): void => {
        if (node.type === "CallExpression" && createdBy(node, locals) === "system") {
            const declaration = literalOf(node.arguments[0]);
            const lists = declaration === undefined ? null : createLists(module, sites.link, [declaration]);
            const changed = declaration === undefined ? null : propertyOf(declaration, "components");
            const filter = changed?.type === "ObjectExpression" ? propertyOf(changed, "changed") : null;
            const lookups = declaration === undefined ? null : propertyOf(declaration, "lookup");
            const watched = lookups?.type === "ObjectExpression" ? lookups.properties.flatMap(property => property.type === "Property" && property.value.type === "ObjectExpression" ? [propertyOf(property.value, "changed")] : []) : [];
            for (const list of [filter, ...watched]) {
                if (list === null || lists === null || list.type === "Literal") continue;
                const names = lists.names(list);
                if (!("error" in names)) for (const name of names) observed.add(name);
            }
        }
        for (const child of children(node)) observe(child);
    };
    observe(program);
    /** Why a kernel can't read a value of a layout that isn't linear, as registration says (`unreadByKernels`). */
    const unread = (layout: Layout): string => layout.kind === "string" ? "a string, which kernels don't read yet" : "which isn't stored in linear memory";
    /**
     * How a kernel doesn't match the layouts of what it reads, as registering it finds (`kernelMismatch` in
     * `world/check-kernel.ts`): a tried kernel then runs as written, and a required one fails to register.
     */
    const mismatchOf = (explanation: KernelExplanation): string | null => {
        const reads = [
            ...explanation.columns.flatMap(identity => identity.startsWith("field ") ? [identity.split(" ")[1] ?? ""] : []),
            ...explanation.upColumns.map(identity => identity.split(" ")[0] ?? ""),
        ];
        for (const key of reads) {
            const layout = layoutNamed(key);
            if (typeof layout === "string") return layout;
            if (layout !== undefined && layout.kind !== "linear") return `it reads ${key}, ${unread(layout)}`;
        }
        for (const key of explanation.signature.lookups.flatMap(lookup => lookup.read)) {
            const layout = layoutNamed(key);
            if (typeof layout === "string") return layout;
            if (layout !== undefined && layout.kind !== "linear") return `a lookup reads ${key}, ${unread(layout)}`;
        }
        return null;
    };
    const elsewhere = (key: string): string => `it reads ${key}, declared in another module, whose layout the world reads when it registers the system`;

    /** Places a kernel's columns, lookups and scalars as the world would (`bindKernel` in `world/kernels.ts`). */
    const place = (explanation: KernelExplanation, inputSchema: Schema | undefined, watchedBy: (lookup: string) => number): Placed => {
        const ids = new Map<string, number>();
        const idOf = (key: string): number => {
            let id = ids.get(key);
            if (id === undefined) ids.set(key, id = ids.size);
            return id;
        };
        const dense: WasmColumn = { view: "f64", stride: 8, offset: 0, boolean: false, component: -1 };
        const field = (key: string, json: string, id: number): WasmColumn | { readonly registration: string } | { readonly none: string } => {
            const layout = layoutNamed(key);
            if (layout === undefined) return { registration: elsewhere(key) };
            if (typeof layout === "string") return { none: layout };
            if (layout.kind !== "linear") return { none: `it reads ${key}, ${unread(layout)}` };
            const path: unknown = JSON.parse(json);
            const leaf = layout.leaves.find(candidate => Array.isArray(path) && samePath(candidate.path, path));
            if (leaf === undefined) return { none: `${key} has no scalar at ${json}` };
            return { view: leaf.view, stride: layout.stride, offset: leaf.offset, boolean: leaf.scalar === "boolean", component: id };
        };
        const columns: WasmColumn[] = [];
        for (const identity of explanation.columns) {
            const [kind = "", key = "", json = "[]"] = identity.split(" ");
            if (kind !== "field") {
                columns.push((kind === "changed" || kind === "chunks" || kind === "blocks") && !observed.has(key) ? { ...dense, muted: true } : dense);
                continue;
            }
            const column = field(key, json, idOf(key));
            if ("registration" in column || "none" in column) return column;
            columns.push(column);
        }
        const upColumns: WasmColumn[] = [];
        for (const identity of explanation.upColumns) {
            const [key = "", json = "[]"] = identity.split(" ");
            const column = field(key, json, idOf(key));
            if ("registration" in column || "none" in column) return column;
            upColumns.push(column);
        }
        const { signature } = explanation;
        if (signature.lookups.some(lookup => lookup.index)) return { registration: "it looks up through an index, whose key layout the world builds when it registers the system" };
        const lookups: WasmLookup[] = [];
        for (const lookup of signature.lookups) {
            for (const key of lookup.read) {
                const layout = layoutNamed(key);
                if (layout === undefined) return { registration: elsewhere(key) };
            }
            lookups.push({
                reads: lookup.read.length,
                watched: lookup.watches ? watchedBy(lookup.name) : 0,
                leaf: (read, path) => {
                    const layout = layoutNamed(lookup.read[read] ?? "");
                    if (layout === undefined || typeof layout === "string" || layout.kind !== "linear") return null;
                    const found = layout.leaves.find(leaf => samePath(leaf.path, path));
                    return found === undefined ? null : { view: found.view, stride: layout.stride, offset: found.offset, boolean: found.scalar === "boolean" };
                },
            });
        }
        for (const resource of signature.resources) if (layoutNamed(resource) === undefined) return { registration: elsewhere(resource) };
        let inputLayout: Layout | null = null;
        if (inputSchema !== undefined) {
            try {
                inputLayout = layoutOf(inputSchema);
            } catch {
                // An input the world can't lay out isn't read as scalars.
                inputLayout = null;
            }
        }
        const scalarType = (scalar: WasmScalar): Type | null => {
            if (scalar.source === "args") return inputLayout === null ? null : leafType(inputLayout, scalar.path);
            const layout = layoutNamed((scalar.source === "shared" ? signature.shared : signature.resources)[scalar.index] ?? "");
            return layout === undefined || typeof layout === "string" ? null : leafType(layout, scalar.path);
        };
        const scalarKind = (scalar: WasmScalar): ScalarKind => {
            const layout = scalar.source === "shared" ? layoutNamed(signature.shared[scalar.index] ?? "") : undefined;
            const leaf = layout === undefined || typeof layout === "string" || layout.kind !== "linear" ? undefined : layout.leaves.find(candidate => samePath(candidate.path, scalar.path));
            return leaf === undefined ? "f32" : leaf.scalar === "boolean" ? "bool" : leaf.scalar === "i32" || leaf.scalar === "u32" || leaf.scalar === "f64" ? leaf.scalar : "f32";
        };
        return { columns, upColumns, scalarType, scalarKind, lookups };
    };

    /** A kernel's WASM, as WAT, with how it runs its rows, or why there's none. */
    const wasmOf = (explanation: KernelExplanation, declaration: ObjectExpression, inputSchema: Schema | undefined, count: (node: Node) => number): { readonly backend: Backend; readonly lanes: string | null } => {
        if (explanation.program === null) return { backend: { kind: "none", reason: explanation.unprogrammed ?? unprogrammable(explanation.statements) }, lanes: null };
        const placed = place(explanation, inputSchema, lookup => listLength(declaration, ["lookup", lookup, "changed"], count));
        if ("registration" in placed) return { backend: { kind: "registration", reason: placed.registration }, lanes: null };
        if ("none" in placed) return { backend: { kind: "none", reason: placed.none }, lanes: null };
        const { signature } = explanation;
        // An `up` kernel's runner passes only the rows that pass its filters.
        const filters = signature.up !== null ? 0 : listLength(declaration, ["components", "added"], count) + listLength(declaration, ["components", "changed"], count);
        const generated = generateWasmOrReason(explanation.program, placed.columns, placed.scalarType, true, filters, placed.lookups, placed.upColumns,
            explanation.operators, [], [], explanation.storagePrecision, true);
        if (typeof generated === "string") return { backend: { kind: "none", reason: generated }, lanes: null };
        const printed = printWat(generated.bytes);
        if ("failure" in printed) return { backend: { kind: "none", reason: `its WASM can't be printed: ${printed.failure}` }, lanes: null };
        const lanes = !generated.vectorized ? "a row at a time" : explanation.storagePrecision ? "four f32 lanes at a time, rounding each step to storage precision" : "two f64 lanes at a time, bit-exact with the body as written";
        return { backend: { kind: "compiled", code: printed.wat }, lanes };
    };

    /** A GPU kernel's compute shader, or why there's none. */
    const wgslOf = (explanation: KernelExplanation, inputSchema: Schema | undefined): { readonly code: string } | { readonly reason: string; readonly registration?: true } => {
        if (explanation.program === null) return { reason: explanation.unprogrammed ?? unprogrammable(explanation.statements) };
        // GPU kernels have no lookups, so watch nothing.
        const placed = place(explanation, inputSchema, () => 0);
        if ("registration" in placed) return { reason: placed.registration, registration: true };
        if ("none" in placed) return { reason: placed.none };
        const generated = generateWgsl(explanation.program, placed.columns, placed.scalarType, placed.upColumns, placed.scalarKind);
        return typeof generated === "string" ? { reason: generated } : { code: generated.code };
    };

    /** The WGSL a row system not declared `kernel: "gpu"` would compile to if it were, or why it can't be one. */
    const wouldBeGpu = async (declaration: ObjectExpression, body: Node, inputSchema: Schema | undefined): Promise<Backend> => {
        const need = "GPU kernels need `kernel: \"gpu\"`, and this body can't be one";
        const asGpu: ObjectExpression = {
            ...declaration,
            properties: [...declaration.properties.filter(property => !(property.type === "Property" && !property.computed && property.key.type === "Identifier" && property.key.name === "kernel")),
                { type: "Property", key: { type: "Identifier", name: "kernel", start: 0, end: 0 }, value: { type: "Literal", value: "gpu", start: 0, end: 0 }, kind: "init", method: false, shorthand: false, computed: false, start: 0, end: 0 }],
        };
        try {
            kernelOf(asGpu);
        } catch (error) {
            const failure = failureOf(error);
            if (failure === undefined) throw error;
            return { kind: "none", reason: `${need}: ${clause(failure.message)}` };
        }
        const compiled = await sites.compile(declaration, body, "gpu");
        if (!("explain" in compiled)) return { kind: "none", reason: `${need}: ${clause(compiled.message)}` };
        const shader = wgslOf(compiled.explain(), inputSchema);
        if ("code" in shader) return { kind: "eligible", code: shader.code, reason: "With `kernel: \"gpu\"`, it would run as this compute shader in a world with a GPU device" };
        return shader.registration === true ? { kind: "registration", reason: shader.reason } : { kind: "none", reason: `${need}: ${clause(shader.reason)}` };
    };

    /** The thread a system written as is runs on: that of an object it uses placed on one, else `"world"`. */
    const threadOf = (declaration: ObjectExpression, body: Node, positions: { readonly row: number; readonly context: number }): string => {
        const keys = new Set<string>();
        const visit = (node: Node): void => {
            if (node.type === "Identifier") keys.add(node.name);
            for (const child of children(node)) visit(child);
        };
        visit(declaration);
        const used = usedBy(declaration, body, module.bindings, positions);
        for (const set of [used.query?.read, used.query?.write, used.resources?.read, used.resources?.write, used.up]) for (const key of set ?? []) keys.add(key);
        for (const set of used.lookups?.values() ?? []) for (const key of set ?? []) keys.add(key);
        for (const key of keys) {
            const thread = declarations.get(key)?.thread;
            if (thread !== null && thread !== undefined) return thread;
        }
        return "world";
    };

    const formatted = (kernel: CompiledKernel): string => format(`export const create = ${kernel.create};\n`);

    const described: DescribedSystem[] = [];
    const visit = async (node: Node, nested: boolean): Promise<void> => {
        const created = node.type === "CallExpression" ? createdBy(node, locals) : null;
        const system = node.type === "CallExpression" && (created === "system" || created === "render") ? await describeCall(node, created, nested) : null;
        if (system !== null) described.push(system);
        const inner = nested || isFunction(node);
        for (const child of children(node)) await visit(child, inner);
    };

    const describeCall = async (node: SimpleCallExpression, created: "system" | "render", nested: boolean): Promise<DescribedSystem | null> => {
        const [first, second, third] = node.arguments;
        const functional = (argument: Expression | SpreadElement | undefined): boolean => argument !== undefined && (isFunction(argument) || (argument.type === "Identifier" && functionOf(module.bindings.get(argument.name)) !== undefined));
        // One argument that isn't a body makes a composite, which runs the systems it lists.
        if (created === "system" && second === undefined && !functional(first)) return null;
        const alone = created === "system" && second === undefined;
        const declaration = alone ? undefined : literalOf(first);
        const given = alone ? first : second;
        const body = given?.type === "Identifier" ? functionOf(module.bindings.get(given.name)) ?? given : given;
        const kernelValue = declaration === undefined ? null : propertyOf(declaration, "kernel");
        const literal = kernelValue?.type === "Literal" ? kernelValue.value : null;
        const kernel: boolean | "gpu" | null = literal === true || literal === false ? literal : literal === "gpu" ? "gpu" : null;
        const kind: SystemKind = created === "render" ? "render"
            : declaration === undefined ? "per-run"
            : propertyOf(declaration, "observer") !== null ? "observer"
            : propertyOf(declaration, "target") !== null ? "target"
            : propertyOf(declaration, "components") !== null ? "row" : "per-run";
        const base = { start: node.start, end: node.end, binding: bindings.get(node) ?? null, kind, kernel };
        const asWritten = (reason: string, thread: string, wgsl: Backend = { kind: "none", reason }): DescribedSystem => ({
            ...base,
            runs: kind === "render" ? `Its body as written, once per run, on "${thread}", while the world has a GPU device` : `Its body as written, on the "${thread}" thread`,
            js: { kind: "none", reason }, wasm: { kind: "none", reason }, wgsl,
        });
        const input = third?.type === "ObjectExpression" ? valueOf(third) : undefined;
        const inputSchema = isSchema(input) ? input : undefined;
        const written = (): string => body !== undefined && body.type !== "SpreadElement" && isFunction(body) && declaration !== undefined
            ? threadOf(declaration, body, kind === "render" ? positionsOf("render", declaration) : positionsOf("system", declaration)) : "world";
        if (kind === "render") return asWritten("a render system runs as written, recording GPU work with shaders of your own; `Gpu.wgsl` gives them their accessors", "world");
        if (kind === "per-run") return asWritten("per-run systems run as written; only row systems compile", written());
        if (kind === "observer") return asWritten("an observer runs as written, reading the settled state after the run's last sync point; only row systems that aren't observers compile", written());
        if (kind === "target") return asWritten("a system with `target` runs as written, once, on the entity its input names; only systems over every matched row compile", written());
        if (declaration === undefined || body === undefined || body.type === "SpreadElement" || !isFunction(body)) {
            return asWritten(declaration === undefined ? "its declaration isn't written in its call, so the build can't read whether it's a kernel" : "its body isn't a function written in place or bound at module scope, so the build can't read it", "world");
        }
        const count = (list: Node): number => {
            const names = createLists(module, sites.link, [declaration, body]).names(list);
            return "error" in names ? 0 : names.length;
        };
        const thread = threadOf(declaration, body, positionsOf("system", declaration));
        const compiled = sites.kernels.get(node);
        if (compiled === undefined) {
            const tried: Failure | undefined = sites.tried.get(node);
            const reason = kernel === false ? "as written, because `kernel: false`"
                : nested ? "it's declared inside a function, and kernels are declared at module scope"
                : body !== given ? "its body is bound by name; a kernel's body is written in its call"
                : declaration.properties.some(property => property.type === "SpreadElement") ? "its declaration spreads another, which the build can't read"
                : tried !== undefined ? `its body isn't a kernel: ${clause(tried.message)}`
                : "the build can't follow how its body uses its row and context: index them by key directly, or destructure them by key";
            const wgsl: Backend = nested || body !== given ? { kind: "none", reason } : await wouldBeGpu(declaration, body, inputSchema);
            return asWritten(reason, thread, wgsl);
        }
        const explanation = compiled.kernel.explain();
        const mismatch = mismatchOf(explanation);
        if (mismatch !== null && !compiled.required) return asWritten(`its body isn't a kernel: ${mismatch}`, thread, await wouldBeGpu(declaration, body, inputSchema));
        if (mismatch !== null) {
            const reason = `registering it fails, since ${mismatch}`;
            return { ...base, runs: `Nothing: ${reason}`, js: { kind: "none", reason }, wasm: { kind: "none", reason }, wgsl: { kind: "none", reason } };
        }
        const wasm = wasmOf(explanation, declaration, inputSchema, count);
        const cpu = wasm.lanes !== null
            ? `WASM on the kernel pool's workers, ${wasm.lanes}; the JS kernel where the world can't run WASM, without shared memory or where a content security policy forbids it`
            : "The JS kernel, on the kernel pool's workers";
        const js: Backend = { kind: "compiled", code: formatted(compiled.kernel) };
        if (kernel === "gpu") {
            const shader = wgslOf(explanation, inputSchema);
            const wgsl: Backend = "code" in shader ? { kind: "compiled", code: shader.code } : shader.registration === true ? { kind: "registration", reason: shader.reason } : { kind: "none", reason: shader.reason };
            return { ...base, runs: `A compute shader, in a world with a GPU device; in one without, ${clause(cpu)}`, js, wasm: wasm.backend, wgsl };
        }
        return { ...base, runs: cpu, js, wasm: wasm.backend, wgsl: await wouldBeGpu(declaration, body, inputSchema) };
    };

    await visit(program, false);
    return described;
};
