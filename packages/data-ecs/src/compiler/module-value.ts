import type { Node } from 'estree';
import { fail, within, type Frame } from './failure.js';
import { resolveBinding, type Resolved } from './link.js';
import type { Module, ModuleBinding } from './module-scope.js';
import type { Out } from './out.js';
import { rootScope, type Scope } from './scope.js';
import type { Value } from './value.js';

/** Whether `name` is one of the kernel's component or resource keys. */
export const isKey = (scope: Scope, name: string): boolean => {
    const signature = scope.unit.signature;
    return signature.read.has(name) || signature.write.has(name) || signature.resources.includes(name)
        || signature.lookups.some(lookup => lookup.read.includes(name));
};

/** Records a failure at `position` in `module` as a frame of `name`. */
export const frameIn = (module: Module, name: string) => (position: number): Frame => ({ name, file: module.file, ...module.locate(position) });

const displayName = (name: string): string => name === "*default*" ? "default export" : name;

/** A definition in `module`: a function to inline, or a constant compiled in its own module. */
const definition = (node: Node, name: string, binding: ModuleBinding, module: Module, scope: Scope, out: Out): Value => {
    const unit = scope.unit;
    const identity = `${module.file}\0${name}`;
    const display = displayName(name);
    switch (binding.kind) {
        case "function":
            return { kind: "function", name: display, identity, params: binding.node.params, body: binding.node.body, module };
        case "const": {
            const init = binding.init;
            if (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression") {
                if (init.async || init.generator) return fail(init, `${display} must be a plain function to be inlined`);
                return { kind: "function", name: display, identity, params: init.params, body: init.body, module };
            }
            if (unit.active.has(identity)) return fail(node, `${display} refers to itself`);
            unit.active.add(identity);
            const compile = (): Value => unit.expression(init, rootScope(unit, true, module), out);
            const value = module === scope.module ? compile() : within(node, frameIn(module, display), compile);
            unit.active.delete(identity);
            return value;
        }
        case "import": case "importNamespace":
            return moduleValue(node, name, binding, module, scope, out);
        case "other":
            return fail(node, `${display} is not a module-scope const`);
    }
};

/** A name the linker resolved. */
export const resolvedValue = (node: Node, resolved: Resolved, scope: Scope, out: Out): Value => {
    switch (resolved.kind) {
        case "error": return fail(node, resolved.error);
        case "namespace": return { kind: "namespace", file: resolved.file };
        case "binding": return definition(node, resolved.name, resolved.binding, resolved.module, scope, out);
    }
};

/** A binding of `module`, followed through imports to the module that defines it. */
export const moduleValue = (node: Node, name: string, binding: ModuleBinding, module: Module, scope: Scope, out: Out): Value => {
    const unit = scope.unit;
    if (module === unit.module && isKey(scope, name)) return fail(node, `${name} is a key; use it to index, as in row[${name}]`);
    if (binding.kind !== "import" && binding.kind !== "importNamespace") return definition(node, name, binding, module, scope, out);
    if (unit.link === null) return fail(node, `${name} is imported, and this build doesn't link imports`);
    return resolvedValue(node, resolveBinding(unit.link, module, name, binding), scope, out);
};
