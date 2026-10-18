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
     * module or imported through any re-exports and namespaces, holding an array literal or `Archetype.create` of one.
     * A key of another module's list is named by the kernel's binding of the same definition, or else by the list
     * itself, as `List[k]`.
     */
    readonly names: (node: Node) => ListNames;
    /** Whether a node names a list rather than one key; a name the compiler can't follow is taken as a key. */
    readonly isList: (node: Node) => boolean;
};

/** A list's array literal, the module it's written in, and how the kernel's module refers to it. */
type Found = { readonly literal: ArrayExpression; readonly module: Module; readonly reference: string };

type Followed = Found | { readonly error: string };

/** `Archetype.create(<array literal>)`, with `Archetype` imported under any name: its array literal, else null. */
const createdList = (node: Expression, module: Module): ArrayExpression | null => {
    if (node.type !== "CallExpression" || node.arguments.length !== 1) return null;
    const { callee } = node;
    if (callee.type !== "MemberExpression" || callee.computed || callee.object.type !== "Identifier" || callee.property.type !== "Identifier" || callee.property.name !== "create") return null;
    const binding = module.bindings.get(callee.object.name);
    const [list] = node.arguments;
    return binding?.kind === "import" && binding.imported === "Archetype" && list.type === "ArrayExpression" ? list : null;
};

const fileOf = (module: Module, kernel: Module): string => module === kernel ? "this module" : module.file;

/** Follows a binding to the array literal its constant holds, through imports and constants naming another. */
const follow = (name: string, binding: ModuleBinding, module: Module, kernel: Module, link: Link | null, reference: string, seen: Set<string>): Followed => {
    const identity = `${module.file}\0${name}`;
    if (seen.has(identity)) return { error: `${reference} refers to itself` };
    seen.add(identity);
    switch (binding.kind) {
        case "const": {
            const { init } = binding;
            if (init.type === "ArrayExpression") return { literal: init, module, reference };
            const created = createdList(init, module);
            if (created !== null) return { literal: created, module, reference };
            if (init.type === "Identifier") {
                const aliased = module.bindings.get(init.name);
                if (aliased !== undefined) return follow(init.name, aliased, module, kernel, link, reference, seen);
            }
            return { error: `${reference} is computed when ${fileOf(module, kernel)} runs, so the compiler can't read its components; declare it as an array literal, or Archetype.create of one` };
        }
        case "import": case "importNamespace":
            if (link === null) return { error: `${reference} is imported, and this build doesn't link imports` };
            return followResolved(resolveBinding(link, module, name, binding), kernel, link, reference, seen);
        case "function": case "other":
            return { error: `${reference} isn't a module-scope const, so the compiler can't read its components` };
    }
};

const followResolved = (resolved: Resolved, kernel: Module, link: Link | null, reference: string, seen: Set<string>): Followed => {
    switch (resolved.kind) {
        case "error": return { error: resolved.error };
        case "namespace": return { error: `${reference} is a module namespace, not a list of components` };
        case "binding": return follow(resolved.name, resolved.binding, resolved.module, kernel, link, reference, seen);
    }
};

/** The names of a member chain of identifiers, `A.B.C`, outermost first; null for any other node. */
const chain = (node: Node): readonly string[] | null => {
    if (node.type === "Identifier") return [node.name];
    if (node.type !== "MemberExpression" || node.computed || node.property.type !== "Identifier") return null;
    const object = chain(node.object);
    return object === null ? null : [...object, node.property.name];
};

/** The literal a list node names: itself, or the constant an identifier or a namespace member chain names. */
const find = (node: Node, kernel: Module, link: Link | null): Followed => {
    if (node.type === "ArrayExpression") return { literal: node, module: kernel, reference: "" };
    const names = chain(node);
    if (names === null) return { error: "commands and kernel declarations name a list as an array literal, or a constant holding one or Archetype.create of one" };
    const [first, ...members] = names;
    const reference = names.join(".");
    const binding = kernel.bindings.get(first);
    if (binding === undefined) return { error: `${first} isn't bound at module scope` };
    if (members.length === 0) return follow(first, binding, kernel, kernel, link, reference, new Set());
    if (binding.kind !== "importNamespace") return { error: `${first} isn't a module namespace, so ${reference} isn't a list the compiler can read` };
    if (link === null) return { error: `${reference} is imported, and this build doesn't link imports` };
    let resolved = resolveBinding(link, kernel, first, binding);
    for (const member of members) {
        if (resolved.kind !== "namespace") return resolved.kind === "error" ? { error: resolved.error } : { error: `${reference} isn't a list the compiler can read` };
        resolved = resolveExport(link, resolved.file, member);
    }
    return followResolved(resolved, kernel, link, reference, new Set());
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
        const found = find(node, kernel, link);
        if (!("literal" in found)) return found;
        const { literal, module, reference } = found;
        const result: string[] = [];
        for (let k = 0; k < literal.elements.length; k++) {
            const element = literal.elements[k];
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
    return {
        names,
        isList: node => {
            if (node.type === "ArrayExpression") return true;
            const found = find(node, kernel, link);
            return "literal" in found;
        },
    };
};
