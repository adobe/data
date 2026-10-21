import type { Node, ObjectExpression, Program, SimpleCallExpression } from 'estree';
import { compileKernel, type CompiledKernel } from './compile-kernel.js';
import { children, isFunction } from './estree.js';
import { fail, failureOf, type Failure } from './failure.js';
import { isPending, type Link, type Linker } from './link.js';
import { createModule, locateIn, type Module } from './module-scope.js';
import { attachKernelPath, prepareLookupPath, prepareSpawnPath } from './paths.js';
import { spawnSites } from './spawns.js';
import { kernelOf } from './signature.js';
import { usedBy } from './body-access.js';
import { requireExact } from './exact.js';
import { createLists } from './lists.js';
import { neverReachesCommands } from './terminal.js';
import { lookupSites } from './lookups.js';
import { terminalBodiesName } from '../world/terminal.js';

export type Parse = (code: string) => Program;
/** Whether an import specifier, resolved from the module being transformed, is the package's, which exports `System` and `Finalizer`. */
export type ResolveSystemImport = (source: string) => Promise<boolean>;
/**
 * The JS expression for kernel `index`'s module url. `identity` is everything the description and module are
 * compiled to (the description without its url, plus the module source), so it can version the url.
 */
export type KernelUrl = (index: number, identity: string) => string;
/**
 * `kernels[i]` is the source of kernel `i`'s module, which exports `create`. `dependencies` are the other files
 * whose functions and constants the kernels inline, or that compiling them read before failing.
 */
export type TransformResult =
    | { readonly code: string; readonly kernels: readonly string[]; readonly dependencies: readonly string[] }
    | { readonly failure: Failure; readonly dependencies: readonly string[] };

type Edit = { readonly start: number; readonly end: number; readonly text: string };

/** The local names of the package's `System` and `Finalizer` namespaces, by the namespace each names. */
const systemLocals = async (program: Program, resolveSystemImport: ResolveSystemImport): Promise<ReadonlyMap<string, "System" | "Finalizer">> => {
    const locals = new Map<string, "System" | "Finalizer">();
    for (const statement of program.body) {
        if (statement.type !== "ImportDeclaration" || typeof statement.source.value !== "string") continue;
        const specifiers = statement.specifiers.flatMap(specifier => specifier.type === "ImportSpecifier" && specifier.imported.type === "Identifier"
            && (specifier.imported.name === "System" || specifier.imported.name === "Finalizer") ? [{ local: specifier.local.name, imported: specifier.imported.name }] : []);
        if (specifiers.length > 0 && await resolveSystemImport(statement.source.value)) {
            for (const { local, imported } of specifiers) locals.set(local, imported === "System" ? "System" : "Finalizer");
        }
    }
    return locals;
};

type Created = "system" | "finalizer" | "changes";

/** `System.create`, or `Finalizer.create` or `Finalizer.changes`, whose bodies run on the main thread; null for any other call. */
const createdBy = (node: SimpleCallExpression, locals: ReadonlyMap<string, "System" | "Finalizer">): Created | null => {
    if (node.callee.type !== "MemberExpression" || node.callee.computed || node.callee.object.type !== "Identifier" || node.callee.property.type !== "Identifier") return null;
    const namespace = locals.get(node.callee.object.name);
    const method = node.callee.property.name;
    if (namespace === "System") return method === "create" ? "system" : null;
    return namespace === "Finalizer" && (method === "create" || method === "changes") ? (method === "create" ? "finalizer" : "changes") : null;
};

/** Which parameters are the row and the context: a system without `components` takes only its context, and a changes finalizer takes its changes first. */
const positionsOf = (created: Created, declaration: ObjectExpression): { readonly row: number; readonly context: number } => {
    if (created === "changes") return { row: -1, context: 1 };
    const rowed = declaration.properties.some(property =>
        property.type === "Property" && !property.computed && property.key.type === "Identifier" && property.key.name === "components");
    return rowed ? { row: 0, context: 1 } : { row: -1, context: 0 };
};

/**
 * A spawn site's function: the components, then one parameter per value, so values pass without an object to a
 * spawner generated for the site's key order and the list's shape (`PreparedSpawn` in `world/prepared-spawn.ts`).
 * The keys are read in module scope, as the prepared spawn's argument, so no binding the function declares can capture
 * one (`hygiene.test.ts`).
 */
const spawnFunction = (name: string, prepare: string, keys: readonly string[]): string => {
    const values = keys.map((_, k) => `v${k}`).join(", ");
    return [
        `const ${name} = (p => (c, l${keys.length > 0 ? `, ${values}` : ""}) => {`,
        "const s = p.begin(c, l);",
        `return s === null ? p.fallback(c, l, [${values}]) : s(${values});`,
        `})(${prepare}(() => [${keys.join(", ")}]));`,
    ].join("\n");
};

/**
 * An add site's function: the entity, the components, then one parameter per value, each appended straight to the
 * commands' buffer (`PreparedAdd` in `world/prepared-spawn.ts`). Its keys are read in module scope, as a spawn site's are.
 */
const addFunction = (name: string, prepare: string, keys: readonly string[]): string => {
    const values = keys.map((_, k) => `v${k}`);
    return [
        `const ${name} = (p => (c, e, l${values.map(value => `, ${value}`).join("")}) => {`,
        `if (p.begin(c, e, l)) { ${values.map((value, k) => `p.value(${k}, ${value}); `).join("")}p.end(); }`,
        `else p.fallback(c, e, l, [${values.join(", ")}]);`,
        `})(${prepare}(() => [${keys.join(", ")}]));`,
    ].join("\n");
};

const uniqueName = (code: string, base: string): string => {
    let name = base;
    for (let n = 1; code.includes(name); n++) name = `${base}${n}`;
    return name;
};

/** Compiles a kernel, loading what it imports as compiling reaches it. */
const compileLinked = async (declaration: ObjectExpression, body: Node, module: Module, target: "cpu" | "gpu", link: Link | null): Promise<CompiledKernel> => {
    for (;;) {
        try {
            return compileKernel(declaration, body, module, target, link);
        } catch (error) {
            if (!isPending(error)) throw error;
            await error.pending;
        }
    }
};

type KernelSite = { readonly node: SimpleCallExpression; readonly declaration: ObjectExpression; readonly body: Node; readonly target: "cpu" | "gpu" };

/**
 * Wraps each kernel `System.create(declaration, body)` call as `attachKernel(call, description)`, and returns each
 * kernel's `create` as its own module, referenced by `description.url`. Functions and constants kernels import are
 * inlined through `linker`.
 * Also passes the values of main-thread spawns and adds of literal keys positionally (`spawns.ts`).
 * Returns null when the module has neither, and a `Failure` when a kernel leaves the subset.
 */
export const transformKernels = async (
    code: string, id: string, parse: Parse, resolveSystemImport: ResolveSystemImport, kernelUrl: KernelUrl, linker?: Linker,
): Promise<TransformResult | null> => {
    if ((!code.includes("System") && !code.includes("Finalizer")) || id.includes("\0")) return null;
    const program = parse(code);
    const locals = await systemLocals(program, resolveSystemImport);
    if (locals.size === 0) return null;
    const file = id.split("?")[0] ?? id;
    const module = createModule(file, program, locateIn(code));
    linker?.add(module);
    const dependencies = new Set<string>();
    /** Main-thread declarations are checked only against lists of their own module. */
    const mainThreadLists = createLists(module, null, []);
    const link: Link | null = linker === undefined ? null : {
        module: dependency => {
            if (dependency !== file) dependencies.add(dependency);
            return linker.module(dependency);
        },
        resolve: linker.resolve,
    };
    const attach = uniqueName(code, "attachKernel$");
    const prepare = uniqueName(code, "prepareSpawn$");
    const prepareAddName = uniqueName(code, "prepareAdd$");
    const spawnName = uniqueName(code, "spawn$");
    const terminal = uniqueName(code, "terminal$");
    const prepareLookupName = uniqueName(code, "prepareLookup$");
    const lookupName = uniqueName(code, "lookup$");
    let looking = false;
    let terminals = false;
    const edits: Edit[] = [];
    const kernels: string[] = [];
    const sites: KernelSite[] = [];
    /** Module-scope declarations of prepared spawns, appended after everything they name is declared. */
    const prepared: string[] = [];
    let adding = false;
    let spawning = false;
    const visit = (node: Node, nested: boolean): void => {
        const created = node.type === "CallExpression" ? createdBy(node, locals) : null;
        const [first, second] = node.type === "CallExpression" ? node.arguments : [];
        // One argument that isn't a body makes a composite, of a list or a declaration: never a kernel, nor checked.
        const composite = created === "system" && first !== undefined && second === undefined && !isFunction(first);
        if (node.type === "CallExpression" && created !== null && !composite) {
            // A system that declares nothing is made from its body alone, which takes only its context.
            const alone = created === "system" && first !== undefined && isFunction(first) && second === undefined;
            const declaration = alone ? undefined : first;
            const body = alone ? first : second;
            const target = declaration?.type === "ObjectExpression" ? kernelOf(declaration) : null;
            if (declaration?.type === "ObjectExpression" && target !== null) {
                if (nested) fail(node, "kernel systems must be declared at module scope");
                if (body === undefined || body.type === "SpreadElement") return fail(node, "a kernel needs an inline body");
                sites.push({ node, declaration, body, target });
                return;
            }
            const positions = alone ? { row: -1, context: 0 } : declaration?.type === "ObjectExpression" ? positionsOf(created, declaration) : null;
            if (declaration?.type === "ObjectExpression" && positions !== null && body !== undefined && body.type !== "SpreadElement") {
                requireExact(declaration, usedBy(declaration, body, module.bindings, positions), module.bindings, mainThreadLists);
            }
            // A system whose body never reaches its commands is terminal where its declaration allows (`world/tails.ts`).
            if (created === "system" && positions !== null && body !== undefined && body.type !== "SpreadElement" && neverReachesCommands(body, positions.context)) {
                terminals = true;
                edits.push({ start: body.start, end: body.start, text: `${terminal}(` }, { start: body.end, end: body.end, text: ")" });
            }
            const spawns = positions === null || body === undefined || body.type === "SpreadElement" ? null : spawnSites(body, module.bindings, positions.context);
            // Index lookups pass their key positionally, through a list of their own (`world/prepared-lookup.ts`).
            const lookups = positions === null || body === undefined || body.type === "SpreadElement" || declaration?.type !== "ObjectExpression" ? [] : lookupSites(body, declaration, positions.context);
            const spawned = spawns?.sites ?? [];
            for (const site of lookups) {
                if (spawned.some(other => other.start < site.end && site.start < other.end)) continue;
                const name = `${lookupName}${prepared.length}`;
                prepared.push(`const ${name} = ${prepareLookupName}(${JSON.stringify(site.shape)}).find;`);
                looking = true;
                const values = [site.callee, ...site.values].map(value => code.slice(value.start, value.end));
                edits.push({ start: site.start, end: site.end, text: `${name}(${values.join(", ")})` });
            }
            if (spawns !== null && spawns.sites.length > 0) {
                for (const site of spawns.sites) {
                    const name = `${spawnName}${prepared.length}`;
                    prepared.push(site.kind === "spawn" ? spawnFunction(name, prepare, site.keys) : addFunction(name, prepareAddName, site.keys));
                    if (site.kind === "add") adding = true;
                    else spawning = true;
                    const values = [...site.entity === null ? [] : [site.entity], site.components, ...site.values].map(value => code.slice(value.start, value.end));
                    edits.push({ start: site.start, end: site.end, text: `${name}(${[spawns.commands, ...values].join(", ")})` });
                }
                return;
            }
        }
        const inner = nested || isFunction(node);
        for (const child of children(node)) visit(child, inner);
    };
    try {
        visit(program, false);
        for (const { node, declaration, body, target } of sites) {
            const compiled = await compileLinked(declaration, body, module, target, link);
            const source = `export const create = ${compiled.create};\n`;
            const description = compiled.description(kernelUrl(kernels.length, `${compiled.description("")}\n${source}`));
            kernels.push(source);
            edits.push({ start: node.start, end: node.end, text: `${attach}(${code.slice(node.start, node.end)}, ${description})` });
        }
    } catch (error) {
        const failure = failureOf(error);
        if (failure === undefined) throw error;
        return { failure, dependencies: [...dependencies] };
    }
    if (edits.length === 0) return null;
    let result = code;
    for (const edit of [...edits].sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
    const imports = [
        ...kernels.length > 0 ? [`import { attachKernel as ${attach} } from ${JSON.stringify(attachKernelPath)};`] : [],
        ...spawning ? [`import { prepareSpawn as ${prepare} } from ${JSON.stringify(prepareSpawnPath)};`] : [],
        ...adding ? [`import { prepareAdd as ${prepareAddName} } from ${JSON.stringify(prepareSpawnPath)};`] : [],
        ...looking ? [`import { prepareLookup as ${prepareLookupName} } from ${JSON.stringify(prepareLookupPath)};`] : [],
    ];
    const marking = terminals ? [`function ${terminal}(body) { const set = Symbol.for(${JSON.stringify(terminalBodiesName)}); (globalThis[set] || (globalThis[set] = new WeakSet())).add(body); return body; }`] : [];
    return { code: [...imports, result, ...prepared, ...marking].join("\n"), kernels, dependencies: [...dependencies] };
};
