// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { FunctionDeclaration, MaybeNamedFunctionDeclaration, Node, ObjectExpression, Program, SimpleCallExpression } from 'estree';
import { posix } from 'node:path';
import { compileKernel, type CompiledKernel } from './compile-kernel.js';
import { children, isFunction } from './estree.js';
import { fail, failureOf, type Failure } from './failure.js';
import { isPending, type Link, type Linker } from './link.js';
import { createModule, locateIn, type Module, type ModuleBinding } from './module-scope.js';
import type { PackageCopy } from './paths.js';
import { archetypeFunction } from './archetypes.js';
import { listSites, spawnSites } from './spawns.js';
import { kernelOf, type KernelRequest } from './signature.js';
import { usedBy, type Used } from './body-access.js';
import { accessText, followsAll, inOrder, resolvedDeclaration, unrequired } from './inferred.js';
import { neverReachesCommands } from './terminal.js';
import { lookupSites } from './lookups.js';
import { terminalBodiesName } from '../world/terminal.js';
import { accessName as accessName$ } from '../../interface/registry/ids.js';

export type Parse = (code: string) => Program;
/**
 * The copy of the package an import specifier, resolved from the module being transformed, is a module of that exports
 * `namespace`; null when it's no such module. Compiled code imports the runtime from that copy.
 */
export type ResolveSystemImport = (source: string, namespace: "System" | "Finalizer") => Promise<PackageCopy | null>;
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
    | { readonly code: string; readonly kernels: readonly string[]; readonly dependencies: readonly string[]; readonly warnings: readonly string[] }
    | { readonly failure: Failure; readonly dependencies: readonly string[] };

type Edit = { readonly start: number; readonly end: number; readonly text: string };

/** The local names of the package's `System` and `Finalizer` namespaces, by the namespace each names. */
/** The module's local names of `System` and `Finalizer`, and the copy of the package the first of them comes from. */
const systemLocals = async (program: Program, resolveSystemImport: ResolveSystemImport): Promise<{ readonly locals: ReadonlyMap<string, "System" | "Finalizer">; readonly copy: PackageCopy | null }> => {
    const locals = new Map<string, "System" | "Finalizer">();
    let copy: PackageCopy | null = null;
    for (const statement of program.body) {
        if (statement.type !== "ImportDeclaration" || typeof statement.source.value !== "string") continue;
        const specifiers = statement.specifiers.flatMap(specifier => specifier.type === "ImportSpecifier" && specifier.imported.type === "Identifier"
            && (specifier.imported.name === "System" || specifier.imported.name === "Finalizer") ? [{ local: specifier.local.name, imported: specifier.imported.name }] : []);
        for (const { local, imported } of specifiers) {
            const namespace = imported === "System" ? "System" : "Finalizer";
            const resolved = await resolveSystemImport(statement.source.value, namespace);
            if (resolved === null) continue;
            copy ??= resolved;
            locals.set(local, namespace);
        }
    }
    return { locals, copy };
};

type Created = "system" | "render" | "finalizer" | "changes";

/** `System.create` or `System.render`, or `Finalizer.create` or `Finalizer.changes`, whose bodies the build reads; null for any other call. */
const createdBy = (node: SimpleCallExpression, locals: ReadonlyMap<string, "System" | "Finalizer">): Created | null => {
    if (node.callee.type !== "MemberExpression" || node.callee.computed || node.callee.object.type !== "Identifier" || node.callee.property.type !== "Identifier") return null;
    const namespace = locals.get(node.callee.object.name);
    const method = node.callee.property.name;
    if (namespace === "System") return method === "create" ? "system" : method === "render" ? "render" : null;
    return namespace === "Finalizer" && (method === "create" || method === "changes") ? (method === "create" ? "finalizer" : "changes") : null;
};

/**
 * Which parameters are the row and the context: a system without `components` takes only its context, a render
 * system its GPU context first, and a changes finalizer its changes first.
 */
const positionsOf = (created: Created, declaration: ObjectExpression): { readonly row: number; readonly context: number } => {
    if (created === "changes" || created === "render") return { row: -1, context: 1 };
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

/**
 * A declaration written in place: an object literal, or one passed to a call that wraps it, as a helper giving it a
 * label or an id does; undefined for anything else.
 */
const literalOf = (node: Node | undefined): ObjectExpression | undefined => {
    if (node?.type === "ObjectExpression") return node;
    if (node?.type === "CallExpression" && node.arguments[0]?.type === "ObjectExpression") return node.arguments[0];
    return undefined;
};

/** Fails the build for a key the body uses that its declaration doesn't require, which would otherwise narrow what it matches unseen. */
const requireRequired = (used: Used, declaration: ObjectExpression, body: Node): void => {
    const found = unrequired(used, declaration);
    if (found !== null) fail(body, `${found.key} isn't in ${found.list}, so the system doesn't require it: add it there to use it`);
};

/** A function declaration with a name, which `export default` may leave out. */
const isNamed = (node: FunctionDeclaration | MaybeNamedFunctionDeclaration): node is FunctionDeclaration => node.id !== null;

/** The function a module-scope binding holds: a function declaration, or a `const` initialized by one. */
const functionOf = (binding: ModuleBinding | undefined): Node | undefined => {
    if (binding?.kind === "function") return isNamed(binding.node) ? binding.node : undefined;
    if (binding?.kind === "const" && isFunction(binding.init)) return binding.init;
    return undefined;
};

/** The declaration of a system that declares nothing, made from its body alone. */
const empty: ObjectExpression = { type: "ObjectExpression", properties: [], start: 0, end: 0 };

/** Whether a declaration has property `name`, written out. */
const declares = (declaration: ObjectExpression, name: string): boolean => declaration.properties.some(property =>
    property.type === "Property" && !property.computed && property.key.type === "Identifier" && property.key.name === name);

const uniqueName = (code: string, base: string): string => {
    let name = base;
    for (let n = 1; code.includes(name); n++) name = `${base}${n}`;
    return name;
};

/** Compiles a kernel, loading what it imports as compiling reaches it. */
const compileLinked = async (declaration: ObjectExpression, body: Node, module: Module, request: KernelRequest, link: Link | null): Promise<CompiledKernel> => {
    for (;;) {
        try {
            return compileKernel(declaration, body, module, request.target, link, !request.required);
        } catch (error) {
            if (!isPending(error)) throw error;
            await error.pending;
        }
    }
};

type KernelSite = { readonly node: SimpleCallExpression; readonly declaration: ObjectExpression; readonly body: Node; readonly request: KernelRequest; readonly used: Used };

/**
 * The module's `System.create` calls that compile to kernels, required or, when `automatic`, tried: at module scope,
 * with an inline body. Throws for a required one elsewhere or without one; a tried one there runs as written.
 */
const kernelSites = (program: Program, locals: ReadonlyMap<string, "System" | "Finalizer">, automatic: boolean, module: Module): readonly KernelSite[] => {
    const sites: KernelSite[] = [];
    const visit = (node: Node, nested: boolean): void => {
        if (node.type === "CallExpression" && createdBy(node, locals) === "system") {
            const [declaration, body] = node.arguments;
            // One argument makes a composite, or a system from its body alone: never a kernel.
            const request = declaration?.type === "ObjectExpression" && body !== undefined ? kernelOf(declaration) : null;
            if (declaration?.type === "ObjectExpression" && request !== null) {
                const inline = body !== undefined && isFunction(body);
                if (request.required && nested) fail(node, "kernel systems must be declared at module scope");
                if (request.required && !inline) fail(node, "a kernel needs an inline body");
                if (!nested && inline && (request.required || automatic)) {
                    const used = inOrder(usedBy(declaration, body, module.bindings, positionsOf("system", declaration)), declaration);
                    requireRequired(used, declaration, body);
                    // A kernel compiles from what its body uses, so the build must see every use.
                    if (followsAll(used, declaration)) sites.push({ node, declaration, body, request, used });
                    else if (request.required) fail(body, "a kernel's body indexes its row and context by key directly, or destructures them by key, so the build sees what it reads and writes; it can't pass them on, alias or spread them");
                }
            }
        }
        const inner = nested || isFunction(node);
        for (const child of children(node)) visit(child, inner);
    };
    visit(program, false);
    return sites;
};

/**
 * Wraps each kernel `System.create(declaration, body)` call as `attachKernel(call, description)`, and returns each
 * kernel's `create` as its own module, referenced by `description.url`. Functions and constants kernels import are
 * inlined through `linker`.
 * Also passes the values of main-thread spawns and adds of literal keys positionally (`spawns.ts`).
 * Returns null when the module has neither, and a `Failure` when a kernel leaves the subset.
 */
export const transformKernels = async (
    code: string, id: string, parse: Parse, resolveSystemImport: ResolveSystemImport, kernelUrl: KernelUrl, linker?: Linker,
    /** Whether unflagged systems are tried as kernels; tests turn it off to run their bodies as written. */
    automatic = true,
): Promise<TransformResult | null> => {
    if ((!code.includes("System") && !code.includes("Finalizer")) || id.includes("\0")) return null;
    const program = parse(code);
    const { locals, copy } = await systemLocals(program, resolveSystemImport);
    if (copy === null) return null;
    const file = id.split("?")[0] ?? id;
    const module = createModule(file, program, locateIn(code));
    linker?.add(module);
    const dependencies = new Set<string>();
    const at = (node: Node): string => `${posix.basename(file)}:${module.locate(node.start).line}`;
    const warnings: string[] = [];
    const accessName = uniqueName(code, "access$");
    let accessing = false;
    const link: Link | null = linker === undefined ? null : {
        module: dependency => {
            if (dependency !== file) dependencies.add(dependency);
            return linker.module(dependency);
        },
        resolve: linker.resolve,
        reductionOf: linker.reductionOf,
    };
    const attach = uniqueName(code, "attachKernel$");
    const prepare = uniqueName(code, "prepareSpawn$");
    const prepareAddName = uniqueName(code, "prepareAdd$");
    const spawnName = uniqueName(code, "spawn$");
    const terminal = uniqueName(code, "terminal$");
    const prepareLookupName = uniqueName(code, "prepareLookup$");
    const lookupName = uniqueName(code, "lookup$");
    const listName = uniqueName(code, "list$");
    const archetypeName = uniqueName(code, "archetype$");
    let indexing = false;
    let looking = false;
    let terminals = false;
    const edits: Edit[] = [];
    const kernels: string[] = [];
    /** Each compiled kernel's description, by its call, and whether its declaration required it. */
    const compiled = new Map<Node, { readonly description: string; readonly required: boolean; readonly used: Used }>();
    /** Module-scope declarations of prepared spawns, appended after everything they name is declared. */
    const prepared: string[] = [];
    let adding = false;
    let spawning = false;
    const visit = (node: Node, nested: boolean): void => {
        const created = node.type === "CallExpression" ? createdBy(node, locals) : null;
        const [first, second] = node.type === "CallExpression" ? node.arguments : [];
        /** Whether `node` is a function, written in place or bound by name at module scope. */
        const functional = (node: Node | undefined): boolean => node !== undefined && (isFunction(node) || (node.type === "Identifier" && functionOf(module.bindings.get(node.name)) !== undefined));
        // One argument that isn't a body makes a composite, of a list or a declaration: never a kernel, nor checked.
        const composite = created === "system" && first !== undefined && second === undefined && !functional(first);
        if (node.type === "CallExpression" && created !== null && !composite) {
            // A system that declares nothing is made from its body alone, which takes only its context.
            const alone = created === "system" && first !== undefined && functional(first) && second === undefined;
            const declaration = alone ? undefined : literalOf(first);
            const given = alone ? first : second;
            // A body given by name is the function its module binds it to, which the build reads in its place.
            const body = given?.type === "Identifier" ? functionOf(module.bindings.get(given.name)) ?? given : given;
            const kernel = compiled.get(node);
            const positions = alone ? { row: -1, context: 0 } : declaration?.type === "ObjectExpression" ? positionsOf(created, declaration) : created === "render" ? positionsOf(created, empty) : null;
            // A declaration not written in place, or a body that isn't a function written in place, is one the build can't
            // read: it takes what it uses from an internal factory, or fails where it's made.
            if (positions === null || first === undefined || first.type === "SpreadElement" || body === undefined || body.type === "SpreadElement" || !isFunction(body)) {
                for (const child of children(node)) visit(child, nested || isFunction(node));
                return;
            }
            const declared = declaration?.type === "ObjectExpression" ? declaration : empty;
            const used = kernel?.used ?? inOrder(usedBy(declared, body, module.bindings, positions), declared);
            requireRequired(used, declared, body);
            const where = at(body);
            if (used.query === null) warnings.push(`${where}: the build can't follow how this body uses its row, so it takes every component in with as written: index the row by key directly, or destructure it by key, to let it tell what the body reads and writes.`);
            if (used.lookups !== null && [...used.lookups.values()].some(read => read === null) || used.lookups === null && declares(declared, "lookup")) {
                warnings.push(`${where}: the build can't follow how this body uses a lookup's rows, so it takes everything they hold as read.`);
            }
            accessing = true;
            const access = accessText(used, where);
            if (kernel !== undefined) {
                // `first` is the declaration: a kernel's call has one written in place.
                const call = `${code.slice(node.start, first.start)}${accessName}(${code.slice(first.start, first.end)}, ${access})${code.slice(first.end, node.end)}`;
                edits.push({ start: node.start, end: node.end, text: `${attach}(${call}, ${kernel.description}${kernel.required ? "" : ", true"})` });
                return;
            }
            // Edits within a body apply only to one written in place; a body given by name is only read.
            if (given !== body) {
                edits.push({ start: first.start, end: first.start, text: `${accessName}(` }, { start: first.end, end: first.end, text: `, ${access})` });
                return;
            }
            // A system whose body never reaches its commands is terminal where its declaration allows (`world/tails.ts`).
            const terminalBody = created === "system" && neverReachesCommands(body, positions.context);
            if (terminalBody) terminals = true;
            if (alone) {
                // The body is the system's first argument, which takes what it uses, outside its terminal mark.
                edits.push(
                    { start: body.start, end: body.start, text: `${accessName}(${terminalBody ? `${terminal}(` : ""}` },
                    { start: body.end, end: body.end, text: `${terminalBody ? ")" : ""}, ${access})` },
                );
            }
            else {
                edits.push({ start: first.start, end: first.start, text: `${accessName}(` }, { start: first.end, end: first.end, text: `, ${access})` });
                if (terminalBody) edits.push({ start: body.start, end: body.start, text: `${terminal}(` }, { start: body.end, end: body.end, text: ")" });
            }
            const spawns = spawnSites(body, module.bindings, positions.context);
            // Index lookups pass their key positionally, through a list of their own (`world/prepared-lookup.ts`).
            const lookups = declaration?.type !== "ObjectExpression" ? [] : lookupSites(body, declaration, positions.context);
            const spawned = spawns?.sites ?? [];
            // Lists of keys its commands take are made once, with an index, rather than on every call.
            const made = new Map<number, { readonly end: number; readonly text: string }>();
            const listed = listSites(body, module.bindings, positions.context);
            for (const site of listed) {
                const inside = [...spawned, ...lookups].some(other => other.start <= site.start && site.end <= other.end && !("components" in other && other.components.start === site.start));
                if (inside) continue;
                const name = `${listName}${prepared.length}`;
                prepared.push(`var ${name};`);
                indexing = true;
                made.set(site.start, { end: site.end, text: `(${name} ??= ${archetypeName}([${site.names.join(", ")}]))` });
            }
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
                    const values = [...site.entity === null ? [] : [site.entity], site.components, ...site.values].map(value => {
                        const list = made.get(value.start);
                        if (list === undefined || list.end !== value.end) return code.slice(value.start, value.end);
                        made.delete(value.start);
                        return list.text;
                    });
                    edits.push({ start: site.start, end: site.end, text: `${name}(${[spawns.commands, ...values].join(", ")})` });
                }
                for (const [start, { end, text }] of made) edits.push({ start, end, text });
                return;
            }
            for (const [start, { end, text }] of made) edits.push({ start, end, text });
        }
        const inner = nested || isFunction(node);
        for (const child of children(node)) visit(child, inner);
    };
    try {
        for (const { node, declaration, body, request, used } of kernelSites(program, locals, automatic, module)) {
            let kernel: CompiledKernel;
            try {
                kernel = await compileLinked(resolvedDeclaration(declaration, used), body, module, request, link);
            } catch (error) {
                // A body tried unflagged that leaves the subset runs as written.
                if (!request.required && failureOf(error) !== undefined) continue;
                throw error;
            }
            const source = `export const create = ${kernel.create};\n`;
            compiled.set(node, { description: kernel.description(kernelUrl(kernels.length, `${kernel.description("")}\n${source}`)), required: request.required, used });
            kernels.push(source);
        }
        visit(program, false);
    } catch (error) {
        const failure = failureOf(error);
        if (failure === undefined) throw error;
        return { failure, dependencies: [...dependencies] };
    }
    if (edits.length === 0) return null;
    let result = code;
    for (const edit of [...edits].sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
    const imports = [
        ...kernels.length > 0 ? [`import { attachKernel as ${attach} } from ${JSON.stringify(copy.attachKernel)};`] : [],
        ...spawning ? [`import { prepareSpawn as ${prepare} } from ${JSON.stringify(copy.preparedSpawn)};`] : [],
        ...adding ? [`import { prepareAdd as ${prepareAddName} } from ${JSON.stringify(copy.preparedSpawn)};`] : [],
        ...looking ? [`import { prepareLookup as ${prepareLookupName} } from ${JSON.stringify(copy.preparedLookup)};`] : [],
    ];
    const marking = terminals ? [`function ${terminal}(body) { const set = Symbol.for(${JSON.stringify(terminalBodiesName)}); (globalThis[set] || (globalThis[set] = new WeakSet())).add(body); return body; }`] : [];
    // An internal factory may have given its declaration what its body uses first, which stands.
    const giving = accessing ? [`function ${accessName}(made, uses) { const key = Symbol.for(${JSON.stringify(accessName$)}); const map = globalThis[key] || (globalThis[key] = new WeakMap()); if (!map.has(made)) map.set(made, uses); return made; }`] : [];
    const indexed = indexing ? [archetypeFunction(archetypeName)] : [];
    return { code: [...imports, result, ...prepared, ...marking, ...giving, ...indexed].join("\n"), kernels, dependencies: [...dependencies], warnings };
};
