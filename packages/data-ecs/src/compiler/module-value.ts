import type { Node } from 'estree';
import type { Builtins } from './builtins.js';
import { fail } from './failure.js';
import type { ModuleBinding, ModuleScope } from './module-scope.js';
import type { Out } from './out.js';
import { rootScope, type Scope } from './scope.js';
import type { Value } from './value.js';

const isKey = (scope: Scope, name: string): boolean => {
    const signature = scope.unit.signature;
    return signature.read.has(name) || signature.write.has(name) || signature.resources.includes(name)
        || signature.lookups.some(lookup => lookup.read.includes(name));
};

/** Distinguishes same-named definitions of different modules, for the recursion check. */
const moduleIds = new WeakMap<ModuleScope, number>();
let nextModuleId = 0;
const definitionName = (module: ModuleScope, name: string): string => {
    let id = moduleIds.get(module);
    if (id === undefined) moduleIds.set(module, id = ++nextModuleId);
    return `${name}@${id}`;
};

/** A binding of `module`: the kernel's own module, or a math module a builtin was defined in. */
export const moduleValue = (node: Node, name: string, binding: ModuleBinding, module: ModuleScope, scope: Scope, out: Out): Value => {
    const unit = scope.unit;
    if (module === unit.module && isKey(scope, name)) return fail(node, `${name} is a key; use it to index, as in row[${name}]`);
    const unique = module === unit.module ? name : definitionName(module, name);
    switch (binding.kind) {
        case "function":
            return { kind: "function", name: unique, params: binding.node.params, body: binding.node.body, module };
        case "const": {
            const init = binding.init;
            if (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression") {
                if (init.async || init.generator) return fail(init, `${name} must be a plain function to be inlined`);
                return { kind: "function", name: unique, params: init.params, body: init.body, module };
            }
            if (unit.active.has(unique)) return fail(node, `${name} refers to itself`);
            unit.active.add(unique);
            const value = unit.expression(init, rootScope(unit, true, module), out);
            unit.active.delete(unique);
            return value;
        }
        case "builtin": {
            const builtins = unit.builtins;
            if (builtins === null) return fail(node, `${name} is imported; kernels can only use helpers and constants defined in this module`);
            if (binding.target.kind === "namespace") return { kind: "namespace", file: binding.target.file };
            return builtinValue(node, name, builtins.resolve(binding.target.file, binding.target.name), scope, out);
        }
        case "import":
            return fail(node, `${name} is imported; kernels can only use helpers and constants defined in this module, and the package's math types`);
        case "other":
            return fail(node, `${name} is not a module-scope const`);
    }
};

/** A resolved math module export: a namespace, or a function or constant compiled in its own module. */
export const builtinValue = (node: Node, name: string, resolved: ReturnType<Builtins["resolve"]>, scope: Scope, out: Out): Value => {
    if (resolved === undefined) return fail(node, `${name} isn't a function or constant of the package's math types`);
    if ("namespace" in resolved) return { kind: "namespace", file: resolved.namespace };
    return moduleValue(node, name, resolved.binding, resolved.scope, scope, out);
};
