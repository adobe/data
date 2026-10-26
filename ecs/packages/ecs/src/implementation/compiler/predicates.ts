// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Expression, FunctionDeclaration, MaybeNamedFunctionDeclaration, MemberExpression, Node, ObjectExpression } from 'estree';
import { children, declaredIn, isFunction, patternNames } from './estree.js';
import { fail, within } from './failure.js';
import { resolveBinding, type Link } from './link.js';
import type { Module, ModuleBinding } from './module-scope.js';
import { frameIn } from './module-value.js';

// What a `where` predicate may read: its value, the world's resources, literals, and module-scope constants and pure
// functions. The world runs it as written whenever a resource it reads changed, so anything else that may change, a
// module variable, a closure over a function's state or a global, would make its cached result wrong.

/** Globals a predicate may read: pure functions and constants of the language, and namespaces of them. */
const pureGlobals: ReadonlySet<string> = new Set(["Math", "Number", "Infinity", "NaN", "undefined", "isFinite", "isNaN"]);

/** By namespace global, the members a predicate may read: each pure, or a constant; `Math.random` isn't. */
const pureMembers: ReadonlyMap<string, ReadonlySet<string>> = new Map([
    ["Math", new Set([
        "abs", "acos", "acosh", "asin", "asinh", "atan", "atan2", "atanh", "cbrt", "ceil", "clz32", "cos", "cosh", "exp", "expm1", "floor", "fround",
        "hypot", "imul", "log", "log10", "log1p", "log2", "max", "min", "pow", "round", "sign", "sin", "sinh", "sqrt", "tan", "tanh", "trunc",
        "E", "LN10", "LN2", "LOG10E", "LOG2E", "PI", "SQRT1_2", "SQRT2",
    ])],
    ["Number", new Set([
        "EPSILON", "MAX_SAFE_INTEGER", "MAX_VALUE", "MIN_SAFE_INTEGER", "MIN_VALUE", "NaN", "NEGATIVE_INFINITY", "POSITIVE_INFINITY",
        "isFinite", "isInteger", "isNaN", "isSafeInteger", "parseFloat", "parseInt",
    ])],
]);

/** Methods that change what they're called on, of arrays, typed arrays, maps, sets and data views, which a predicate may call only on what it made. */
const mutatingMethods: ReadonlySet<string> = new Set(["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin", "set", "add", "delete", "clear"]);

/** Whether a method may change what it's called on: a known one, or a data view's setter. */
const mutates = (name: string | null): boolean => name === null || mutatingMethods.has(name) || /^set[A-Z]/.test(name);

/** A function declaration with a name, which `export default` may leave out. */
const isNamed = (node: FunctionDeclaration | MaybeNamedFunctionDeclaration): node is FunctionDeclaration => node.id !== null;

/** Whether `node`, a child of `parent`, names a property or declares a binding, rather than referring to one. */
const isName = (node: Node, parent: Node | undefined): boolean => {
    switch (parent?.type) {
        case "MemberExpression": return parent.property === node && !parent.computed;
        case "Property": return parent.key === node && !parent.computed && !parent.shorthand;
        case "MethodDefinition": case "PropertyDefinition": return parent.key === node && !parent.computed;
        case "LabeledStatement": case "BreakStatement": case "ContinueStatement": return true;
        default: return false;
    }
};

/** The identifiers a function refers to that it doesn't declare, each at its first reference. */
const freeNames = (fn: Node): ReadonlyMap<string, Node> => {
    const declared = new Set<string>();
    declaredIn(fn, name => declared.add(name));
    if (fn.type === "ArrowFunctionExpression" || fn.type === "FunctionExpression" || fn.type === "FunctionDeclaration") {
        for (const parameter of fn.params) for (const name of patternNames(parameter)) declared.add(name);
    }
    const free = new Map<string, Node>();
    const visit = (node: Node, parent: Node | undefined): void => {
        if (node.type === "ThisExpression") fail(node, "a where predicate reads its value and resources, never this");
        if (node.type === "Identifier" && !isName(node, parent) && !declared.has(node.name) && !free.has(node.name)) free.set(node.name, node);
        for (const child of children(node)) visit(child, node);
    };
    visit(fn, undefined);
    return free;
};

/** A member's name, when it's written as one or as a string literal; null for one computed otherwise. */
const memberName = (node: MemberExpression): string | null =>
    !node.computed && node.property.type === "Identifier" ? node.property.name
    : node.computed && node.property.type === "Literal" && typeof node.property.value === "string" ? node.property.value
    : null;

/** An expression as the build prints it in a failure: a name and its members, or "it" for anything else. */
const textOf = (node: Node): string => {
    if (node.type === "Identifier") return node.name;
    if (node.type === "MemberExpression") {
        const name = memberName(node);
        const object = textOf(node.object);
        if (name !== null && !node.computed) return `${object}.${name}`;
        return `${object}[${node.property.type === "Identifier" ? node.property.name : name === null ? "…" : JSON.stringify(name)}]`;
    }
    return "it";
};

/** The innermost object of a chain of members: what a write or call through it reaches. */
const rootOf = (node: Node): Node => node.type === "MemberExpression" ? rootOf(node.object) : node;

/**
 * Fails the build where a function writes through anything but what it made of its own, calls a method that changes
 * what it's called on, a known one or one computed by name, on anything else, reads a member of `Math` or `Number` that isn't pure, or imports a module. What it makes of its
 * own is a local holding an object or array it wrote out, never assigned anything else; every other value, its value,
 * resources, parameters, globals and functions among them, may be shared. `global(name)` says whether a name it doesn't
 * declare is a global, and `imported(name)` whether it's an import, whose members the reads check holds to the
 * package's own namespaces and functions, which are fixed.
 */
const checkEffects = (fn: Node, global: (name: string) => boolean, imported: (name: string) => boolean): void => {
    const declared = new Set<string>();
    declaredIn(fn, name => declared.add(name));
    // Names declared with an object or array it writes out, then never assigned.
    const own = new Set<string>();
    const shared = new Set<string>();
    const scan = (node: Node): void => {
        if (node.type === "VariableDeclarator") {
            if (node.id.type === "Identifier" && (node.init?.type === "ObjectExpression" || node.init?.type === "ArrayExpression")) own.add(node.id.name);
            else for (const name of patternNames(node.id)) shared.add(name);
        }
        if (node.type === "AssignmentExpression" && node.left.type === "Identifier") shared.add(node.left.name);
        for (const child of children(node)) scan(child);
    };
    scan(fn);
    if (fn.type === "ArrowFunctionExpression" || fn.type === "FunctionExpression" || fn.type === "FunctionDeclaration") {
        for (const parameter of fn.params) for (const name of patternNames(parameter)) shared.add(name);
    }
    const isOwn = (node: Node): boolean => {
        const root = rootOf(node);
        return root.type === "Identifier" && own.has(root.name) && !shared.has(root.name) && declared.has(root.name);
    };
    const written = (target: Node): void => {
        if (target.type === "MemberExpression") {
            if (!isOwn(target)) fail(target, `a where predicate writes through ${textOf(rootOf(target))}, which it only reads`);
            return;
        }
        if (target.type === "ObjectPattern" || target.type === "ArrayPattern" || target.type === "AssignmentPattern" || target.type === "RestElement") {
            for (const child of children(target)) written(child);
        }
        if (target.type === "Property") written(target.value);
    };
    const visit = (node: Node): void => {
        switch (node.type) {
            case "ImportExpression": return fail(node, "a where predicate imports a module, which may run anything");
            case "AssignmentExpression": written(node.left); break;
            case "UpdateExpression": written(node.argument); break;
            case "UnaryExpression": if (node.operator === "delete") written(node.argument); break;
            case "ForInStatement": case "ForOfStatement": if (node.left.type !== "VariableDeclaration") written(node.left); break;
            case "MemberExpression": {
                const { object } = node;
                if (object.type === "Identifier" && !declared.has(object.name) && global(object.name)) {
                    const members = pureMembers.get(object.name);
                    const name = memberName(node);
                    if (members !== undefined && (name === null || !members.has(name))) fail(node, `a where predicate reads ${textOf(node)}, which isn't pure`);
                }
                break;
            }
            case "CallExpression": {
                const { callee } = node;
                if (callee.type === "MemberExpression" && !isOwn(callee)) {
                    const root = rootOf(callee);
                    const name = memberName(callee);
                    // A namespace global's members are pure where they're read, above.
                    const free = root === callee.object && root.type === "Identifier" && !declared.has(root.name);
                    const namespace = free && ((global(root.name) && pureMembers.has(root.name)) || imported(root.name));
                    if (!namespace && mutates(name)) fail(callee, `a where predicate calls ${textOf(callee)}, which may change what it reads`);
                }
                break;
            }
            default: break;
        }
        for (const child of children(node)) visit(child);
    };
    visit(fn);
};

/** Whether an expression is a literal: a number, string, boolean or `null`, possibly negated, or a template without expressions. */
const isLiteral = (node: Expression): boolean =>
    node.type === "Literal" ? node.value === null || ["number", "string", "boolean"].includes(typeof node.value)
    : node.type === "UnaryExpression" ? (node.operator === "-" || node.operator === "+") && isLiteral(node.argument)
    : node.type === "TemplateLiteral" && node.expressions.length === 0;

/** Whether an expression is a `Symbol(...)` call: a key, which a predicate indexes resources by. */
const isSymbolCall = (node: Expression): boolean => node.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "Symbol";

/**
 * Fails the build where a predicate reads anything but its value, resources, literals, and module-scope constants and
 * pure functions: `outer`, the names declared by functions around it, are state that may change. Functions it calls
 * are checked the same, in their own modules, through `link`; without one, only the package's own imports are read.
 */
export const checkPredicate = (fn: Node, module: Module, link: Link | null, outer: ReadonlySet<string>, packageSpecifier: (specifier: string) => boolean): void => {
    const checked = new Set<Node>();
    const check = (node: Node, at: Module, around: ReadonlySet<string>): void => {
        if (checked.has(node)) return;
        checked.add(node);
        checkEffects(node, name => !around.has(name) && at.bindings.get(name) === undefined, name => {
            const kind = at.bindings.get(name)?.kind;
            return kind === "import" || kind === "importNamespace";
        });
        for (const [name, reference] of freeNames(node)) {
            if (around.has(name)) fail(reference, `a where predicate reads ${name}, which a function around it declares and may change; read only its value, resources and module-scope constants`);
            const binding = at.bindings.get(name);
            if (binding === undefined) {
                if (pureGlobals.has(name)) continue;
                fail(reference, `a where predicate reads the global ${name}, which may change; read only its value, resources and module-scope constants`);
            }
            else definition(reference, name, binding, at);
        }
    };
    const definition = (reference: Node, name: string, binding: ModuleBinding, at: Module): void => {
        switch (binding.kind) {
            case "const": {
                const { init } = binding;
                if (isLiteral(init) || isSymbolCall(init)) return;
                if (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression") {
                    if (init.async || init.generator) fail(reference, `a where predicate calls ${name}, which isn't a plain function`);
                    return void within(reference, frameIn(at, name), () => check(init, at, new Set()));
                }
                return fail(reference, `a where predicate reads ${name}, which holds values that may change; read only its value, resources and module-scope constants`);
            }
            case "function": {
                const { node } = binding;
                if (!isNamed(node)) return fail(reference, `a where predicate calls ${name}, which the build can't read`);
                return void within(reference, frameIn(at, name), () => check(node, at, new Set()));
            }
            case "import": case "importNamespace": {
                if (link === null) {
                    if (packageSpecifier(binding.specifier)) return;
                    return fail(reference, `a where predicate reads ${name}, imported from a module this build doesn't read`);
                }
                const resolved = resolveBinding(link, at, name, binding);
                if (resolved.kind === "namespace" || (resolved.kind === "binding" && link.packages.packagePathOf(resolved.module.file)?.startsWith("interface/") === true)) {
                    // The package's own namespaces and functions are fixed.
                    if (resolved.kind === "namespace" ? link.packages.packagePathOf(resolved.file)?.startsWith("interface/") === true : true) return;
                    return fail(reference, `a where predicate reads the namespace ${name}, whose members the build doesn't check`);
                }
                if (resolved.kind === "error") return fail(reference, `a where predicate reads ${name}, which the build can't read: ${resolved.error}`);
                return void within(reference, frameIn(resolved.module, resolved.name), () => definition(reference, resolved.name, resolved.binding, resolved.module));
            }
            case "other":
                return fail(reference, `a where predicate reads ${name}, a module variable that may change; read only its value, resources and module-scope constants`);
        }
    };
    check(fn, module, outer);
};

/** The predicates of a declaration's `components.where`: each value that's a function in place or a module function by name. */
export const predicatesOf = (declaration: ObjectExpression, module: Module): readonly Node[] => {
    const components = declaration.properties.find(property => property.type === "Property" && !property.computed && property.key.type === "Identifier" && property.key.name === "components");
    if (components?.type !== "Property" || components.value.type !== "ObjectExpression") return [];
    const where = components.value.properties.find(property => property.type === "Property" && !property.computed && property.key.type === "Identifier" && property.key.name === "where");
    if (where?.type !== "Property" || where.value.type !== "ObjectExpression") return [];
    const predicates: Node[] = [];
    for (const property of where.value.properties) {
        if (property.type !== "Property") continue;
        const { value } = property;
        if (isFunction(value)) predicates.push(value);
        else if (value.type === "Identifier") {
            const binding = module.bindings.get(value.name);
            if (binding?.kind === "function" && isNamed(binding.node)) predicates.push(binding.node);
            else if (binding?.kind === "const" && isFunction(binding.init)) predicates.push(binding.init);
        }
    }
    return predicates;
};
