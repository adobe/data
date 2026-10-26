// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Expression, Node, ObjectExpression, Pattern, SpreadElement } from 'estree';
import { children, declaredIn } from './estree.js';

type Range = { readonly start: number; readonly end: number };

/** How a call passes a key part: as in `world/index-lookups.ts`'s `Shape`, `0` whole, `n` a tuple of `n` scalars, or a comparison's operators. */
type Form = number | readonly (readonly [string, number])[];

/**
 * A call of an index lookup in a main-thread body: its callee's source, its key's shape, and the source ranges of the
 * values it passes, literals flattened.
 */
export type LookupSite = Range & { readonly callee: Range; readonly shape: readonly Form[]; readonly values: readonly Range[] };

/** Arguments a site passes at most (`world/prepared-lookup.ts`). */
const maximumArguments = 16;

const operators: ReadonlySet<string> = new Set(["==", "!=", "<", ">", "<=", ">="]);

/** A property's plain name: an identifier or a string literal, not computed. */
const nameOf = (key: Node, computed: boolean): string | null =>
    !computed && key.type === "Identifier" ? key.name : key.type === "Literal" && typeof key.value === "string" ? key.value : null;

/** The names of a declaration's lookups that go through an index: those declared as an object literal with `index`. */
const indexLookupsOf = (declaration: ObjectExpression): ReadonlySet<string> => {
    const names = new Set<string>();
    for (const property of declaration.properties) {
        if (property.type !== "Property" || nameOf(property.key, property.computed) !== "lookup" || property.value.type !== "ObjectExpression") continue;
        for (const lookup of property.value.properties) {
            if (lookup.type !== "Property" || lookup.value.type !== "ObjectExpression") continue;
            const name = nameOf(lookup.key, lookup.computed);
            const indexed = lookup.value.properties.some(field => field.type === "Property" && nameOf(field.key, field.computed) === "index");
            if (name !== null && indexed) names.add(name);
        }
    }
    return names;
};

/** How a body reaches its lookups: the context's name, a name bound to `lookup`, and names bound to lookups themselves. */
type Reach = { readonly context: string | null; readonly lookup: string | null; readonly direct: ReadonlyMap<string, string> };

const reachOf = (parameter: Pattern | undefined, names: ReadonlySet<string>): Reach | null => {
    if (parameter?.type === "Identifier") return { context: parameter.name, lookup: null, direct: new Map() };
    if (parameter?.type !== "ObjectPattern") return null;
    for (const property of parameter.properties) {
        if (property.type !== "Property" || nameOf(property.key, property.computed) !== "lookup") continue;
        if (property.value.type === "Identifier") return { context: null, lookup: property.value.name, direct: new Map() };
        if (property.value.type !== "ObjectPattern") return null;
        const direct = new Map<string, string>();
        for (const inner of property.value.properties) {
            if (inner.type !== "Property" || inner.value.type !== "Identifier") continue;
            const name = nameOf(inner.key, inner.computed);
            if (name !== null && names.has(name)) direct.set(inner.value.name, name);
        }
        return { context: null, lookup: null, direct };
    }
    return null;
};

/** The form and values of one argument: a tuple or comparison literal flattened, anything else whole. */
const formOf = (argument: Expression): { readonly form: Form; readonly values: readonly Range[] } => {
    if (argument.type === "ArrayExpression" && argument.elements.length > 0 && argument.elements.every(element => element !== null && element.type !== "SpreadElement")) {
        return { form: argument.elements.length, values: argument.elements.flatMap(element => element === null ? [] : [{ start: element.start, end: element.end }]) };
    }
    if (argument.type === "ObjectExpression" && argument.properties.length > 0) {
        const entries: [string, number][] = [];
        const values: Range[] = [];
        for (const property of argument.properties) {
            if (property.type !== "Property" || property.kind !== "init" || property.method || property.computed) return { form: 0, values: [argument] };
            const operator = nameOf(property.key, false);
            if (operator === null || !operators.has(operator) || property.value.type === "AssignmentPattern" || property.value.type === "ObjectPattern"
                || property.value.type === "ArrayPattern" || property.value.type === "RestElement") return { form: 0, values: [argument] };
            const operand = formOf(property.value);
            entries.push([operator, typeof operand.form === "number" ? operand.form : 0]);
            values.push(...typeof operand.form === "number" ? operand.values : [property.value]);
        }
        return { form: entries, values };
    }
    return { form: 0, values: [argument] };
};

/**
 * The index lookup calls in a main-thread body, whose context is its parameter at `context`: `context.lookup.name(key)`,
 * `lookup.name(key)` and `name(key)` as the parameter's pattern binds them, for lookups the declaration declares with
 * `index` in an object literal. A body that redeclares the names it reaches them by is left alone, and so is a call
 * with a spread argument or more than `maximumArguments` values, or one inside another's arguments.
 */
export const lookupSites = (body: Node, declaration: ObjectExpression, context: number): readonly LookupSite[] => {
    if (body.type !== "ArrowFunctionExpression" && body.type !== "FunctionExpression") return [];
    const names = indexLookupsOf(declaration);
    if (names.size === 0) return [];
    const reach = reachOf(body.params[context], names);
    if (reach === null) return [];
    const declared = new Set<string>();
    declaredIn(body.body, name => declared.add(name));
    if ((reach.context !== null && declared.has(reach.context)) || (reach.lookup !== null && declared.has(reach.lookup))) return [];
    /** Whether a callee is one of the declaration's index lookups, as the body reaches it. */
    const isLookup = (callee: Node): boolean => {
        if (callee.type === "Identifier") return reach.direct.has(callee.name) && !declared.has(callee.name);
        if (callee.type !== "MemberExpression" || callee.computed || callee.optional || callee.property.type !== "Identifier" || !names.has(callee.property.name)) return false;
        const { object } = callee;
        if (object.type === "Identifier") return reach.lookup !== null && object.name === reach.lookup;
        return reach.context !== null && object.type === "MemberExpression" && !object.computed && !object.optional && object.object.type === "Identifier"
            && object.object.name === reach.context && object.property.type === "Identifier" && object.property.name === "lookup";
    };
    const sites: LookupSite[] = [];
    const visit = (node: Node): void => {
        if (node.type === "CallExpression" && !node.optional && isLookup(node.callee) && node.arguments.every((argument): argument is Expression => argument.type !== "SpreadElement")) {
            const forms = node.arguments.map((argument: Expression | SpreadElement) => argument.type === "SpreadElement" ? { form: 0, values: [] } : formOf(argument));
            const values = forms.flatMap(form => form.values);
            if (values.length <= maximumArguments) {
                sites.push({ start: node.start, end: node.end, callee: { start: node.callee.start, end: node.callee.end }, shape: forms.map(form => form.form), values });
                return;
            }
        }
        for (const child of children(node)) visit(child);
    };
    visit(body.body);
    return sites;
};
