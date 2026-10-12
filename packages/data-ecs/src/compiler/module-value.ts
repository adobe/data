import type { Expression as SourceExpression, Node } from 'estree';
import type { Program } from '../world/create/kernel.js';
import { fail, within, type Frame } from './failure.js';
import { resolveBinding, type Resolved } from './link.js';
import { isIntrinsicModule } from './paths.js';
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

const valueTypes: ReadonlySet<string> = new Set([
    "f32", "i32", "u32", "vec2f", "vec3f", "vec4f", "vec2i", "vec3i", "vec4i", "vec2u", "vec3u", "vec4u", "mat4x4f",
]);
const isValueType = (text: string): text is Program.ValueType => valueTypes.has(text);

/** An `intrinsic(declaration, implementation)` call's declaration, read from its literals. */
const intrinsicDeclaration = (node: SourceExpression): Program.Intrinsic => {
    if (node.type !== "ObjectExpression") return fail(node, "an intrinsic is declared with an object literal");
    let operation: string | undefined;
    let form: Program.Intrinsic["form"] = "call";
    let parameters: Program.ValueType[] = [];
    let result: Program.ValueType | undefined;
    const text = (value: Node): string => value.type === "Literal" && typeof value.value === "string" ? value.value : fail(value, "intrinsic fields are string literals");
    const type = (value: Node): Program.ValueType => {
        const name = text(value);
        return isValueType(name) ? name : fail(value, `${name} isn't a WGSL type intrinsics take`);
    };
    for (const property of node.properties) {
        if (property.type !== "Property" || property.computed || property.key.type !== "Identifier") return fail(property, "intrinsic fields are named literals");
        const value = property.value;
        switch (property.key.name) {
            case "wgsl": operation = text(value); break;
            case "form": {
                const name = text(value);
                form = name === "infix" || name === "prefix" ? name : fail(value, "an intrinsic's form is infix or prefix");
                break;
            }
            case "parameters":
                parameters = value.type === "ArrayExpression" ? value.elements.map(element => element === null || element.type === "SpreadElement" ? fail(value, "intrinsic parameters are type names") : type(element)) : fail(value, "intrinsic parameters are an array literal");
                break;
            case "result": result = type(value); break;
            default: return fail(property, `intrinsics have no field ${property.key.name}`);
        }
    }
    if (operation === undefined || result === undefined) return fail(node, "an intrinsic names its wgsl operation and result");
    return { operation, form, parameters, result };
};

/** The implementation of `intrinsic(declaration, implementation)`, and its declaration; null for any other initializer. */
const intrinsicDefinition = (init: SourceExpression, module: Module, scope: Scope): { readonly implementation: SourceExpression; readonly intrinsic: Program.Intrinsic } | null => {
    const link = scope.unit.link;
    if (init.type !== "CallExpression" || init.callee.type !== "Identifier" || link === null) return null;
    const binding = module.bindings.get(init.callee.name);
    if (binding?.kind !== "import") return null;
    const resolved = resolveBinding(link, module, init.callee.name, binding);
    if (resolved.kind !== "binding" || resolved.name !== "intrinsic" || !isIntrinsicModule(resolved.module.file)) return null;
    const [declaration, implementation] = init.arguments;
    if (declaration === undefined || declaration.type === "SpreadElement" || implementation === undefined || implementation.type === "SpreadElement") {
        return fail(init, "intrinsic takes a declaration and an implementation");
    }
    return { implementation, intrinsic: intrinsicDeclaration(declaration) };
};

/** A definition in `module`: a function to inline, or a constant compiled in its own module. */
const definition = (node: Node, name: string, binding: ModuleBinding, module: Module, scope: Scope, out: Out): Value => {
    const unit = scope.unit;
    const identity = `${module.file}\0${name}`;
    const display = displayName(name);
    switch (binding.kind) {
        case "function":
            return { kind: "function", name: display, identity, params: binding.node.params, body: binding.node.body, module };
        case "const": {
            const declared = module === scope.module
                ? intrinsicDefinition(binding.init, module, scope)
                : within(node, frameIn(module, display), () => intrinsicDefinition(binding.init, module, scope));
            const init = declared?.implementation ?? binding.init;
            if (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression") {
                if (init.async || init.generator) return fail(init, `${display} must be a plain function to be inlined`);
                const intrinsic = declared === null ? {} : { intrinsic: declared.intrinsic };
                return { kind: "function", name: display, identity, params: init.params, body: init.body, module, ...intrinsic };
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
