import type { Identifier, Node, Pattern } from 'estree';
import { access } from './access.js';
import { set } from './booleans.js';
import { componentRead } from './columns.js';
import { dataValue, mapLeaves, toData } from './data.js';
import { fail } from './failure.js';
import { local, type Expression } from './ir.js';
import { propertyKey } from './key.js';
import type { Out } from './out.js';
import { requireReadable } from './scalar.js';
import type { Scope } from './scope.js';
import { createSnapshot, snapshotDeclaration, snapshotLeaf } from './snapshot.js';
import { fresh } from './unit.js';
import { describeValue, type Value } from './value.js';

/** How a local is bound. Parameters are mutable data, but may also alias non-data values like `row`. */
export type Binding = "const" | "let" | "parameter";

const isLiteral = (expression: Expression): boolean =>
    expression.kind === "number" || expression.kind === "boolean" || expression.kind === "nullish";

/** The value a new local holds: data is copied into fresh locals, so later writes elsewhere don't change it. */
const declared = (node: Identifier, value: Value, binding: Binding, scope: Scope, out: Out): Value => {
    const keyword = binding === "const" ? "const" : "let";
    const unit = scope.unit;
    const copy = (expression: Expression): Expression => {
        if (binding === "const" && isLiteral(expression)) return expression;
        const target = fresh(unit, node.name);
        out.push(set(unit, target, expression, keyword));
        return local(target);
    };
    switch (value.kind) {
        case "scalar":
            return { kind: "scalar", expression: copy(value.expression) };
        case "dynamic": {
            // Resources and args don't change while a kernel runs, so a const can alias them.
            const constant = value.expression.kind === "resource" || value.expression.kind === "args";
            return binding === "const" && constant ? value : { kind: "dynamic", expression: copy(value.expression) };
        }
        case "tuple": case "struct":
            return dataValue(mapLeaves(toData(value, node, scope), copy));
        case "component": {
            if (value.up !== true) requireReadable(node, scope, value.component);
            const snapshot = createSnapshot(keyword, node.name, path => componentRead(unit, value, path));
            out.push(snapshotDeclaration(snapshot));
            return { kind: "snapshot", snapshot, path: [] };
        }
        case "snapshot": {
            const source = value;
            const snapshot = createSnapshot(keyword, node.name, path => local(snapshotLeaf(unit, source.snapshot, [...source.path, ...path])));
            out.push(snapshotDeclaration(snapshot));
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
