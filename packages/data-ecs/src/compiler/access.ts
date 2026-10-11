import type { Node } from 'estree';
import { entityRead } from './columns.js';
import { fail } from './failure.js';
import type { Key } from './key.js';
import { number, type Expression } from './ir.js';
import { mathConstants, mathFunctions } from './math.js';
import { scalar } from './scalar.js';
import type { Scope } from './scope.js';
import { describeValue, scalarValue, type Value } from './value.js';

const commandNames: ReadonlySet<string> = new Set(["spawn", "despawn", "add", "remove"]);

const literal = (key: Key): number | string | undefined => key.kind === "static" ? key.name : undefined;

/** Indexes a plain JS value. A static index into a resource or `args` extends its path. */
const element = (node: Node, scope: Scope, object: Expression, key: Key, optional: boolean): Expression => {
    if (key.kind === "static" && !optional && (object.kind === "resource" || object.kind === "args")) {
        return { ...object, path: [...object.path, key.name] };
    }
    const index: Expression = key.kind === "static"
        ? typeof key.name === "number" ? number(key.name) : { kind: "string", value: key.name }
        : key.kind === "value" ? scalar(key.value, node, scope)
        : fail(node, `${key.name} is not an index here`);
    return { kind: "element", object, index, optional };
};

const mathConstant = (name: string): Expression => {
    const value: unknown = Reflect.get(Math, name);
    return number(typeof value === "number" ? value : NaN);
};

/** `value[key]`, resolved at compile time where the kernel subset allows. */
export const access = (value: Value, key: Key, node: Node, scope: Scope, optional: boolean): Value => {
    const signature = scope.unit.signature;
    const name = literal(key);
    switch (value.kind) {
        case "row":
            if (key.kind === "binding") {
                if (!signature.read.has(key.name) && !signature.write.has(key.name)) fail(node, `${key.name} is not in query read or write`);
                return { kind: "component", component: key.name, path: [] };
            }
            if (name === "entity") return scalarValue(entityRead(scope.unit));
            return fail(node, "row is indexed by a component in query read or write, or .entity");
        case "context": {
            if (key.kind === "binding") {
                const index = signature.resources.indexOf(key.name);
                return index >= 0 ? { kind: "dynamic", expression: { kind: "resource", index, path: [] } } : fail(node, `${key.name} is not in resources read`);
            }
            if (name === "args" && signature.args) return { kind: "dynamic", expression: { kind: "args", path: [] } };
            const lookup = signature.lookups.findIndex(entry => entry.name === name);
            return lookup >= 0 ? { kind: "lookup", lookup } : fail(node, "the context holds declared resources, lookups and args");
        }
        case "found": {
            const read = signature.lookups[value.lookup]?.read ?? [];
            const index = key.kind === "binding" ? read.indexOf(key.name) : -1;
            if (index < 0) return fail(node, "a lookup result is indexed by a component in that lookup's read");
            return { kind: "dynamic", expression: { kind: "element", object: value.expression, index: number(index), optional } };
        }
        case "dynamic":
            return { kind: "dynamic", expression: element(node, scope, value.expression, key, optional) };
        case "tuple":
            return typeof name === "number" && value.items[name] !== undefined
                ? value.items[name]
                : fail(node, "tuple elements are indexed by an in-range literal");
        case "struct": {
            const field = value.fields.find(([fieldName]) => fieldName === name);
            return field ? field[1] : fail(node, `no field ${String(name)}`);
        }
        case "component":
        case "snapshot":
            return name === undefined
                ? fail(node, "component values are indexed by literal elements or field names")
                : { ...value, path: [...value.path, name] };
        case "math":
            if (typeof name === "string" && mathConstants.has(name)) return scalarValue(mathConstant(name));
            if (typeof name === "string" && mathFunctions.has(name)) return { kind: "method", owner: "math", name };
            return fail(node, `Math.${String(name)} is not in the kernel subset`);
        case "commands":
            if (typeof name === "string" && commandNames.has(name)) return { kind: "method", owner: "commands", name };
            return fail(node, "commands has spawn, despawn, add and remove");
        default:
            return fail(node, `${describeValue(value)} can't be indexed`);
    }
};
