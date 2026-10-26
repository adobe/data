// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ArrayExpression, Expression, Node } from 'estree';
import { children } from './estree.js';
import { resolveBinding, resolveExport, type Link, type Resolved } from './link.js';
import type { Module, ModuleBinding } from './module-scope.js';

/** The keys a list names, each as an expression of the kernel's module; or why the node isn't a list the compiler can read. */
export type ListNames = readonly string[] | { readonly error: string };

/** How a kernel's module reads its lists of keys, wherever they are declared. */
export type Lists = {
    /**
     * The keys a list names: an array literal of the kernel's module-scope identifiers, or a constant, of the kernel's
     * module or imported through any re-exports and namespaces, holding an array literal.
     * A key of another module's list is named by the kernel's binding of the same definition, or else by the list
     * itself, as `List[k]`.
     */
    readonly names: (node: Node) => ListNames;
    /**
     * What a command's component argument names: a list, or one key by the expression the kernel's module names it with.
     * A name is one key when its definition is a call of the global `Symbol`, identified or not, or a literal, which
     * registration rejects for not being a symbol. A name defined in a module the build can't read, such as a package
     * external to it, is taken as a key, and registration rejects a list there. Anything else fails with the reason.
     */
    readonly component: (node: Node) => Named;
    /** Whether the component the kernel's module names `name` is declared `shared`, read through the build from the module declaring it. */
    readonly shared: (name: string) => boolean;
    /**
     * The operator the resource the kernel's module names `name` reduces with, its declaration's `reduce` trait, read
     * through the build from the module declaring it, undefined where the build can't read one, and that module's file;
     * null for a name the module doesn't bind.
     */
    readonly reduction: (name: string) => { readonly operator: string | undefined; readonly file: string } | null;
};

/** What a command's component argument names, or why the compiler can't tell. */
export type Named = { readonly kind: "list" } | { readonly kind: "key"; readonly name: string } | { readonly kind: "error"; readonly error: string };

/** A list's array literal, the module it's written in, and how the kernel's module refers to it. */
type Found = { readonly literal: ArrayExpression; readonly module: Module; readonly reference: string };

/** What a name is defined as: a list, a key by its definition's identity (null where the build can't read it), or why it's neither. */
type Followed = Found | { readonly key: string | null } | { readonly error: string };

/** Whether a name may be one key as well as a list, which words the reasons it's neither. */
type Wanted = "list" | "either";

/** A call of the global `Symbol` in `module`. */
const isSymbolCall = (node: Expression, module: Module): boolean =>
    node.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "Symbol" && !module.bindings.has("Symbol");

/** A key's definition: `Symbol(...)`, as the plugin identifies it, `identify$(Symbol(...), id)`, or a literal. */
const isKey = (node: Expression, module: Module): boolean => {
    if (node.type === "Literal") return !("regex" in node);
    if (isSymbolCall(node, module)) return true;
    if (node.type !== "CallExpression" || node.callee.type !== "Identifier" || !/^identify\$\d*$/.test(node.callee.name)) return false;
    const [symbol] = node.arguments;
    return module.bindings.get(node.callee.name)?.kind === "function" && symbol !== undefined && symbol.type !== "SpreadElement" && isSymbolCall(symbol, module);
};

/** A list's literal as the plugin gives it an index, `archetype$([...])` with its appended function: the literal, else null. */
const indexedList = (node: Expression, module: Module): ArrayExpression | null => {
    if (node.type !== "CallExpression" || node.arguments.length !== 1 || node.callee.type !== "Identifier" || !/^archetype\$\d*$/.test(node.callee.name)) return null;
    const [list] = node.arguments;
    return module.bindings.get(node.callee.name)?.kind === "function" && list.type === "ArrayExpression" ? list : null;
};

const fileOf = (module: Module, kernel: Module): string => module === kernel ? "this module" : module.file;

/** Follows a binding to the array literal or key its constant holds, through imports and constants naming another. */
const follow = (name: string, binding: ModuleBinding, module: Module, kernel: Module, link: Link | null, reference: string, wanted: Wanted, seen: Set<string>): Followed => {
    const identity = `${module.file}\0${name}`;
    if (seen.has(identity)) return { error: `${reference} refers to itself` };
    seen.add(identity);
    const unread = wanted === "list" ? "the compiler can't read its components" : "the compiler can't tell whether it's a key or a list";
    switch (binding.kind) {
        case "const": {
            const { init } = binding;
            if (init.type === "ArrayExpression") return { literal: init, module, reference };
            const indexed = indexedList(init, module);
            if (indexed !== null) return { literal: indexed, module, reference };
            if (init.type === "Identifier") {
                const aliased = module.bindings.get(init.name);
                if (aliased !== undefined) return follow(init.name, aliased, module, kernel, link, reference, wanted, seen);
            }
            if (isKey(init, module)) return { key: identity };
            const declare = wanted === "list" ? "declare it as an array literal, `as const`" : "declare a key as Symbol(...), or a list as an array literal, `as const`";
            return { error: `${reference} is computed when ${fileOf(module, kernel)} runs, so ${unread}; ${declare}` };
        }
        case "import": case "importNamespace":
            // Without a linker nothing imported can be read, so a name that may be one key is taken as one.
            if (link === null) return wanted === "list" ? { error: `${reference} is imported, and this build doesn't link imports` } : { key: null };
            return followResolved(resolveBinding(link, module, name, binding), kernel, link, reference, wanted, seen);
        case "function": case "other":
            return { error: `${reference} isn't a module-scope const, so ${unread}` };
    }
};

const followResolved = (resolved: Resolved, kernel: Module, link: Link | null, reference: string, wanted: Wanted, seen: Set<string>): Followed => {
    switch (resolved.kind) {
        case "error": return wanted === "either" && resolved.cause === "unreadable" ? { key: null } : { error: resolved.error };
        case "namespace": return { error: `${reference} is a module namespace, not ${wanted === "list" ? "a list of components" : "a key or a list of components"}` };
        case "binding": return follow(resolved.name, resolved.binding, resolved.module, kernel, link, reference, wanted, seen);
    }
};

/** The names of a member chain of identifiers, `A.B.C`, outermost first; null for any other node. */
const chain = (node: Node): readonly string[] | null => {
    if (node.type === "Identifier") return [node.name];
    if (node.type !== "MemberExpression" || node.computed || node.property.type !== "Identifier") return null;
    const object = chain(node.object);
    return object === null ? null : [...object, node.property.name];
};

/** What a node names: an array literal, or the definition an identifier or a namespace member chain names. */
const find = (node: Node, kernel: Module, link: Link | null, wanted: Wanted): Followed => {
    if (node.type === "ArrayExpression") return { literal: node, module: kernel, reference: "" };
    const names = chain(node);
    if (names === null) return { error: "commands and kernel declarations name a list as an array literal, or a constant holding one" };
    const [first, ...members] = names;
    const reference = names.join(".");
    const binding = kernel.bindings.get(first);
    if (binding === undefined) return { error: `${first} isn't bound at module scope` };
    if (members.length === 0) return follow(first, binding, kernel, kernel, link, reference, wanted, new Set());
    const what = wanted === "list" ? "a list" : "a key or a list";
    if (binding.kind !== "importNamespace") return { error: `${first} isn't a module namespace, so ${reference} isn't ${what} the compiler can read` };
    if (link === null) return wanted === "list" ? { error: `${reference} is imported, and this build doesn't link imports` } : { key: null };
    let resolved = resolveBinding(link, kernel, first, binding);
    for (const member of members) {
        if (resolved.kind === "error") return followResolved(resolved, kernel, link, reference, wanted, new Set());
        if (resolved.kind !== "namespace") return { error: `${reference} isn't ${what} the compiler can read` };
        resolved = resolveExport(link, resolved.file, member);
    }
    return followResolved(resolved, kernel, link, reference, wanted, new Set());
};

/** The identity of what a binding of `module` defines: its module and name, through imports; null where it can't be followed. */
const definition = (module: Module, name: string, binding: ModuleBinding, link: Link | null): string | null => {
    if (binding.kind !== "import" && binding.kind !== "importNamespace") return `${module.file}\0${name}`;
    if (link === null) return null;
    const resolved = resolveBinding(link, module, name, binding);
    return resolved.kind === "binding" ? `${resolved.module.file}\0${resolved.name}` : null;
};

/**
 * Lists as `kernel` reads them. `nodes` are the kernel's declaration and body: the kernel's names for keys of other
 * modules' lists are found among the module-scope identifiers they use, so only those are followed.
 */
export const createLists = (kernel: Module, link: Link | null, nodes: readonly Node[]): Lists => {
    /** Each key definition's name in the kernel's module, filled from the kernel's identifiers when a list of another module is first read. */
    let named: Map<string, string> | null = null;
    const nameOf = (identity: string, fallback: string): string => {
        if (named === null) {
            const found = new Map<string, string>();
            const followed = new Set<string>();
            const visit = (node: Node): void => {
                if (node.type === "Identifier" && !followed.has(node.name)) {
                    followed.add(node.name);
                    const binding = kernel.bindings.get(node.name);
                    const defined = binding === undefined ? null : definition(kernel, node.name, binding, link);
                    if (defined !== null && !found.has(defined)) found.set(defined, node.name);
                }
                for (const child of children(node)) visit(child);
            };
            for (const node of nodes) visit(node);
            named = found;
        }
        const name = named.get(identity);
        if (name !== undefined) return name;
        named.set(identity, fallback);
        return fallback;
    };
    const names = (node: Node): ListNames => {
        const found = find(node, kernel, link, "list");
        if ("key" in found) {
            const reference = chain(node)?.join(".") ?? "";
            return { error: `${reference} is a key, not a list of components; list it as [${reference}]` };
        }
        if (!("literal" in found)) return found;
        const { literal, module, reference } = found;
        const result: string[] = [];
        for (let k = 0; k < literal.elements.length; k++) {
            const element = literal.elements[k];
            // The kernel's own list may spread another it can read: `with: [...Unit, tagged]`.
            if (element?.type === "SpreadElement" && module === kernel) {
                const spread = names(element.argument);
                if ("error" in spread) return spread;
                result.push(...spread);
                continue;
            }
            const binding = element?.type === "Identifier" ? module.bindings.get(element.name) : undefined;
            if (element?.type !== "Identifier" || binding === undefined) {
                return { error: module === kernel ? "lists name keys by identifiers bound at module scope" : `${reference} names a key by something other than an identifier bound at the scope of ${module.file}` };
            }
            if (module === kernel) {
                result.push(element.name);
                continue;
            }
            const fallback = `${reference}[${k}]`;
            const identity = definition(module, element.name, binding, link);
            result.push(identity === null ? fallback : nameOf(identity, fallback));
        }
        return result;
    };
    const component = (node: Node): Named => {
        const found = find(node, kernel, link, "either");
        if ("literal" in found) return { kind: "list" };
        if ("error" in found) return { kind: "error", error: found.error };
        const reference = chain(node)?.join(".") ?? "";
        // A key named by an identifier is that identifier; one named through a namespace is the kernel's own binding of
        // its definition where it has one.
        return { kind: "key", name: node.type === "Identifier" || found.key === null ? reference : nameOf(found.key, reference) };
    };
    const reduction = (name: string): { readonly operator: string | undefined; readonly file: string } | null => {
        const binding = kernel.bindings.get(name);
        const identity = binding === undefined ? null : definition(kernel, name, binding, link);
        if (identity === null) return null;
        const [file = "", defined = ""] = identity.split("\0");
        return { operator: link?.reductionOf?.(file, defined), file };
    };
    /** Whether a key the kernel names is a shared component, as its declaration's module says. */
    const shared = (name: string): boolean => {
        const binding = kernel.bindings.get(name);
        const identity = binding === undefined ? null : definition(kernel, name, binding, link);
        if (identity === null) return false;
        const [file = "", defined = ""] = identity.split("\0");
        return link?.sharedOf?.(file, defined) === true;
    };
    return { names, component, reduction, shared };
};
