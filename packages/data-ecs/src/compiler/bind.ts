import type { Identifier, Node, Pattern } from 'estree';
import { access } from './access.js';
import { assignment } from './booleans.js';
import { dataValue, mapLeaves, toData } from './data.js';
import { fail } from './failure.js';
import { fieldRead } from './columns.js';
import { propertyKey } from './key.js';
import type { Out } from './out.js';
import { requireReadable } from './scalar.js';
import type { Scope } from './scope.js';
import { createSnapshot, snapshotDeclaration, snapshotLeaf } from './snapshot.js';
import { fresh } from './unit.js';
import { describeValue, type Value } from './value.js';

/** How a local is bound. Parameters are mutable data, but may also alias non-data values like `row`. */
export type Binding = "const" | "let" | "parameter";

const isLiteral = (code: string): boolean => /^(\d[\d.e+-]*|true|false|null)$/.test(code);

/** The value a new local holds: data is copied into fresh locals, so later writes elsewhere don't change it. */
const declared = (node: Identifier, value: Value, binding: Binding, scope: Scope, out: Out): Value => {
    const keyword = binding === "const" ? "const" : "let";
    const unit = scope.unit;
    switch (value.kind) {
        case "scalar": case "dynamic": {
            if (binding === "const" && isLiteral(value.code)) return value;
            const name = fresh(unit, node.name);
            out.push(assignment(unit, `${keyword} `, name, value.code));
            return { kind: value.kind, code: name };
        }
        case "tuple": case "struct":
            return dataValue(mapLeaves(toData(value, node, scope), code => {
                if (binding === "const" && isLiteral(code)) return code;
                const name = fresh(unit, node.name);
                out.push(assignment(unit, `${keyword} `, name, code));
                return name;
            }));
        case "component": {
            requireReadable(node, scope, value.component);
            const snapshot = createSnapshot(keyword, node.name, path => fieldRead(unit, value.component, [...value.path, ...path]));
            out.push(snapshotDeclaration(unit, snapshot));
            return { kind: "snapshot", snapshot, path: [] };
        }
        case "snapshot": {
            const source = value;
            const snapshot = createSnapshot(keyword, node.name, path => snapshotLeaf(unit, source.snapshot, [...source.path, ...path]));
            out.push(snapshotDeclaration(unit, snapshot));
            return { kind: "snapshot", snapshot, path: [] };
        }
        default:
            return binding === "let" ? fail(node, `a let can't hold ${describeValue(value)}; use const`) : value;
    }
};

/** Binds a declaration or parameter pattern to a value. */
export const bind = (pattern: Pattern, value: Value, binding: Binding, scope: Scope, out: Out): void => {
    switch (pattern.type) {
        case "Identifier":
            scope.locals.set(pattern.name, { value: declared(pattern, value, binding, scope, out), mutable: binding !== "const" });
            return;
        case "ArrayPattern":
            pattern.elements.forEach((element, index) => {
                if (element === null) return;
                if (element.type === "RestElement") return fail(element, "rest elements are not in the kernel subset");
                bind(element, access(value, { kind: "static", name: index }, element, scope, false), binding, scope, out);
            });
            return;
        case "ObjectPattern":
            for (const property of pattern.properties) {
                if (property.type === "RestElement") return fail(property, "rest elements are not in the kernel subset");
                bind(property.value, access(value, propertyKey(property, scope, out), property, scope, false), binding, scope, out);
            }
            return;
        default:
            return failPattern(pattern);
    }
};

export const failPattern = (pattern: Node): never =>
    fail(pattern, pattern.type === "AssignmentPattern" ? "default values are not in the kernel subset" : `${pattern.type} is not in the kernel subset`);
