import { chunkShift, type Path } from '../world/kernel.js';
import type { Expression, Statement } from './ir.js';
import { resolve, type Out } from './out.js';
import { rowLabel } from './statement.js';
import type { Unit } from './unit.js';

/** A number as JS source that reads back as the same f64. */
export const printNumber = (value: number): string =>
    Number.isNaN(value) ? "NaN" : value === Infinity ? "Infinity" : Object.is(value, -0) ? "(-0)" : value < 0 ? `(${String(value)})` : String(value);

const printPath = (path: Path): string => path.map(item => `[${JSON.stringify(item)}]`).join("");

export const localName = (unit: Unit, local: number): string => `${unit.names.get(local) ?? "t"}_${local}`;

/** Prints an expression. `observed` converts boolean column reads. */
export const printExpression = (unit: Unit, expression: Expression, observed: boolean): string => {
    const print = (item: Expression): string => printExpression(unit, item, observed);
    switch (expression.kind) {
        case "number": return printNumber(expression.value);
        case "boolean": return String(expression.value);
        case "column": {
            const column = expression.column;
            if (!observed) return `c${column}[x${column}]`;
            unit.booleans.add(column);
            return `(b${column} ? c${column}[x${column}] !== 0 : c${column}[x${column}])`;
        }
        case "upColumn": {
            const column = expression.column;
            const read = `u${column}[p * us${column} + uo${column}]`;
            if (!observed) return read;
            unit.upBooleans.add(column);
            return `(ub${column} ? ${read} !== 0 : ${read})`;
        }
        case "resource": return `r${expression.index}${printPath(expression.path)}`;
        case "args": return `args${printPath(expression.path)}`;
        case "local": return localName(unit, expression.local);
        case "unary": return `(${expression.operator}${print(expression.operand)})`;
        case "binary": case "logical": return `(${print(expression.left)} ${expression.operator} ${print(expression.right)})`;
        case "conditional": return `(${print(expression.test)} ? ${print(expression.consequent)} : ${print(expression.alternate)})`;
        case "math": return `Math.${expression.name}(${expression.arguments.map(print).join(", ")})`;
        case "observe": return printExpression(unit, expression.value, true);
        case "lane": return print(expression.value);
        case "nullish": return expression.value;
        case "string": return JSON.stringify(expression.value);
        case "element": return `${print(expression.object)}${expression.optional ? "?." : ""}[${print(expression.index)}]`;
        case "array": return `[${expression.items.map(print).join(", ")}]`;
        case "record": return `{ ${expression.fields.map(([name, item]) => `${JSON.stringify(name)}: ${print(item)}`).join(", ")} }`;
    }
};

type Labels = ReadonlyMap<number, "block" | "loop">;

const printStatement = (unit: Unit, statement: Statement, labels: Labels): string => {
    const value = (item: Expression): string => printExpression(unit, item, false);
    const branch = (label: number): string => `${labels.get(label) === "loop" ? "continue" : "break"} label_${label};`;
    switch (statement.kind) {
        case "set": {
            const declare = statement.declare === undefined ? "" : `${statement.declare} `;
            return `${declare}${localName(unit, statement.local)} = ${printExpression(unit, statement.value, unit.observed.has(statement.local))};`;
        }
        case "declare": return `let ${statement.locals.map(item => localName(unit, item)).join(", ")};`;
        case "store": return `c${statement.column}[x${statement.column}] = ${value(statement.value)};`;
        case "stamp": {
            const row = `c${statement.column}[x${statement.column}] = tick;`;
            return unit.stampedPerCall.has(statement.chunks) ? row : `${row}\nc${statement.chunks}[i >> ${chunkShift}] = tick;`;
        }
        case "if": {
            const alternate = printStatements(unit, statement.alternate, labels);
            return `if (${value(statement.test)}) {\n${printStatements(unit, statement.consequent, labels)}\n}${alternate === "" ? "" : ` else {\n${alternate}\n}`}`;
        }
        case "block":
            return `label_${statement.label}: {\n${printStatements(unit, statement.body, new Map([...labels, [statement.label, "block"]]))}\n}`;
        case "loop": {
            // `for (;;)` repeats where a WASM loop falls off its end, so a trailing branch back is implicit, and otherwise the loop exits.
            const body = resolve(statement.body);
            const last = body[body.length - 1];
            const repeats = last?.kind === "branch" && last.label === statement.label;
            const inner = new Map([...labels, [statement.label, "loop" as const]]);
            const printed = printStatements(unit, repeats ? body.slice(0, -1) : body, inner);
            return `label_${statement.label}: for (;;) {\n${printed}${repeats ? "" : `\nbreak label_${statement.label};`}\n}`;
        }
        case "branch": return branch(statement.label);
        case "branchIf": return `if (${value(statement.test)}) ${branch(statement.label)}`;
        case "next": return `continue ${rowLabel};`;
        case "intrinsic": return printStatements(unit, statement.body, labels);
        case "lookup": return `const ${localName(unit, statement.local)} = l${statement.lookup}(${value(statement.entity)});`;
        case "spawn": return `const ${localName(unit, statement.local)} = spawn${statement.list}(${statement.values.map(value).join(", ")});`;
        case "begin": return `commands.begin(${statement.command}, ${value(statement.entity)});`;
        case "value": return `commands.value(${statement.key}, ${value(statement.value)});`;
        case "component": return `commands.component(${statement.key});`;
    }
};

/** Prints statements as JS. */
export const printStatements = (unit: Unit, statements: Out | readonly Statement[], labels: Labels = new Map()): string =>
    resolve([...statements]).map(statement => printStatement(unit, statement, labels)).join("\n");
