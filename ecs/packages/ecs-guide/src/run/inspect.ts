// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Values as a run's console writes them: as node's `util.formatWithOptions({ breakLength: Infinity, compact: true })`
 * does, so what a program logs in the guide reads as what it prints in node, its `.out` beside it. Writing a value never
 * throws: what can't be read is written as node writes it, or as what it is. A promise's state can't be read in a
 * browser, so it's written as unknown.
 */

/** How deep values nest before their contents are left out, as node's default depth. */
const defaultDepth = 2;
/** How many items of a list, map or set are written before the rest are counted, and characters of a string. */
const items = 100;
const characters = 10000;
/** How many bytes of a buffer are written. */
const bytes = 100;

const identifier = /^[a-zA-Z_][a-zA-Z_0-9]*$/;

/** Characters a string escapes, as node writes them: C0 controls, the quote, the backslash, and C1 controls. */
const escapes = /[\x00-\x1f\x27\x5c\x7f-\x9f]/g;
const named: { readonly [code: number]: string } = { 8: "\\b", 9: "\\t", 10: "\\n", 12: "\\f", 13: "\\r", 39: "\\'", 92: "\\\\" };
const escapeOf = (character: string): string => {
    const code = character.charCodeAt(0);
    return named[code] ?? `\\x${code.toString(16).toUpperCase().padStart(2, "0")}`;
};

/** A string inside a value: single quotes, or the first other quote it doesn't hold, escaped as node escapes it. */
const quoted = (whole: string): string => {
    const text = whole.length > characters ? whole.slice(0, characters) : whole;
    const left = whole.length - text.length;
    const more = left > 0 ? `... ${left} more character${left === 1 ? "" : "s"}` : "";
    let quote = "'";
    if (text.includes("'")) {
        if (!text.includes("\"")) quote = "\"";
        else if (!text.includes("`") && !text.includes("${")) quote = "`";
    }
    const body = text.replace(escapes, character => quote !== "'" && character === "'" ? character : escapeOf(character));
    return `${quote}${body}${quote}${more}`;
};

const keyOf = (key: string | symbol): string => typeof key === "symbol" ? String(key) : identifier.test(key) ? key : quoted(key);

/** Reads what a value may refuse to give, as a revoked proxy or a throwing getter does; `fallback` when it throws. */
const tryRead = <T>(read: () => T, fallback: T): T => {
    try {
        return read();
    } catch {
        return fallback;
    }
};

/** What one call writes: the depth it stops at, and the objects found within themselves, numbered as node numbers them. */
type Context = { readonly depth: number; readonly hidden: boolean; readonly circular: Map<object, number>; readonly path: object[] };

/** The name of an object's constructor, by its prototype: null for no prototype, and "" for one that can't be read. */
const constructorName = (value: object): string | null => tryRead(() => {
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype === null) return null;
    const constructor: unknown = Reflect.get(Object(prototype), "constructor");
    return typeof constructor === "function" ? constructor.name : "";
}, "");

const braced = (prefix: string, parts: readonly string[], open = "{", close = "}"): string =>
    parts.length === 0 ? `${prefix}${open}${close}` : `${prefix}${open} ${parts.join(", ")} ${close}`;

const isTypedArray = (value: object): value is ArrayLike<unknown> & ArrayBufferView => ArrayBuffer.isView(value) && !(value instanceof DataView);
const isIndex = (key: string): boolean => /^(0|[1-9]\d*)$/.test(key);
const isClass = (value: Function): boolean => tryRead(() => /^class[\s{]/.test(Function.prototype.toString.call(value)), false);

const functionOf = (value: Function): string => {
    const name = tryRead(() => value.name, "");
    if (isClass(value)) return `[class ${name === "" ? "(anonymous)" : name}]`;
    return `[Function${name === "" ? " (anonymous)" : `: ${name}`}]`;
};

/** An object's own enumerable properties, its symbols' too, each `key: value`, an accessor as what it has. */
const properties = (value: object, level: number, context: Context, indentation: number, skip: (key: string) => boolean): string[] =>
    tryRead(() => Reflect.ownKeys(value), []).flatMap(key => {
        const descriptor = tryRead(() => Object.getOwnPropertyDescriptor(value, key), undefined);
        if (descriptor === undefined || descriptor.enumerable !== true || (typeof key === "string" && skip(key))) return [];
        if (descriptor.get !== undefined || descriptor.set !== undefined) {
            const kind = descriptor.get !== undefined && descriptor.set !== undefined ? "Getter/Setter" : descriptor.get !== undefined ? "Getter" : "Setter";
            return [`${keyOf(key)}: [${kind}]`];
        }
        return [`${keyOf(key)}: ${write(descriptor.value, level + 1, context, indentation + 3)}`];
    });

/** A list's items, holes counted as node counts them, and those past `items` counted. */
const listed = (value: ArrayLike<unknown>, level: number, context: Context, indentation: number): string[] => {
    const parts: string[] = [];
    const length = tryRead(() => value.length, 0);
    let index = 0;
    for (; index < length && parts.length < items; index++) {
        if (index in value) {
            parts.push(write(value[index], level + 1, context, indentation + 2));
            continue;
        }
        let end = index;
        while (end + 1 < length && !(end + 1 in value)) end++;
        const empty = end - index + 1;
        parts.push(`<${empty} empty item${empty === 1 ? "" : "s"}>`);
        index = end;
    }
    if (index < length) parts.push(`... ${length - index} more item${length - index === 1 ? "" : "s"}`);
    return parts;
};

/** A map's or a set's entries, those past `items` counted. */
const entriesOf = <T>(entries: Iterable<T>, size: number, each: (entry: T) => string): string[] => {
    const parts: string[] = [];
    for (const entry of entries) {
        if (parts.length >= items) break;
        parts.push(each(entry));
    }
    if (size > items) parts.push(`... ${size - items} more item${size - items === 1 ? "" : "s"}`);
    return parts;
};

const bufferOf = (buffer: ArrayBufferLike): string => {
    const view = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, bytes));
    const shown = [...view].map(byte => byte.toString(16).padStart(2, "0")).join(" ");
    const left = buffer.byteLength - view.length;
    const more = left > 0 ? ` ... ${left} more byte${left === 1 ? "" : "s"}` : "";
    return `{ [Uint8Contents]: <${shown}${more}>, [byteLength]: ${buffer.byteLength} }`;
};

/** An error: its stack, or its name and message in brackets without one, its lines indented to where it's written. */
const errorOf = (error: Error, level: number, context: Context, indentation: number): string => {
    const stack = tryRead(() => error.stack, undefined);
    const text = typeof stack === "string" && stack !== "" ? stack : tryRead(() => `${error.name}: ${error.message}`, "Error");
    const base = text.includes("\n    at") ? text : `[${text}]`;
    const indented = base.split("\n").join(`\n${" ".repeat(indentation)}`);
    const extra = [
        // A cause given to the constructor is hidden, which node shows apart; one assigned is a property like any other.
        ...tryRead(() => Object.getOwnPropertyDescriptor(error, "cause")?.enumerable === false, false) ? [`[cause]: ${write(Reflect.get(error, "cause"), level + 1, context, indentation + 3)}`] : [],
        ...error instanceof AggregateError ? [`[errors]: ${write(error.errors, level + 1, context, indentation + 3)}`] : [],
        ...properties(error, level, context, indentation, key => key === "stack" || key === "message"),
    ];
    if (extra.length === 0) return indented;
    const lines = `\n${" ".repeat(indentation)}  `;
    return base.includes("\n") ? `{ ${indented}${lines}${extra.join(`,${lines}`)} }` : `${indented} { ${extra.join(", ")} }`;
};

/** A value within a call's output at `level`, `indentation` columns in, as node's inspect writes it. */
const write = (value: unknown, level: number, context: Context, indentation = 0): string => {
    switch (typeof value) {
        case "string": return quoted(value);
        case "number": return Object.is(value, -0) ? "-0" : String(value);
        case "bigint": return `${value}n`;
        case "boolean": case "undefined": return String(value);
        case "symbol": return String(value);
    }
    if (value === null) return "null";
    if (typeof value !== "object" && typeof value !== "function") return String(value);
    // A revoked proxy refuses everything.
    if (!tryRead(() => (Object.getPrototypeOf(value), true), false)) return "<Revoked Proxy>";
    if (context.path.includes(value)) {
        let index = context.circular.get(value);
        if (index === undefined) {
            index = context.circular.size + 1;
            context.circular.set(value, index);
        }
        return `[Circular *${index}]`;
    }
    context.path.push(value);
    try {
        const shown = writeObject(value, level, context, indentation);
        const index = context.circular.get(value);
        return index === undefined ? shown : `<ref *${index}> ${shown}`;
    } catch {
        return "{}";
    } finally {
        context.path.pop();
    }
};

const writeObject = (value: object, level: number, context: Context, indentation: number): string => {
    const nested = level > context.depth;
    if (typeof value === "function") {
        const base = functionOf(value);
        const own = nested ? [] : properties(value, level, context, indentation, () => false);
        return own.length === 0 ? base : `{ ${base} ${own.join(", ")} }`;
    }
    if (value instanceof Error) return errorOf(value, level, context, indentation);
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
    if (value instanceof RegExp) return String(value);
    if (value instanceof Boolean || value instanceof Number || value instanceof String) {
        return `[${constructorName(value) ?? "Object"}: ${write(value.valueOf(), level + 1, context)}]`;
    }
    if (value instanceof Promise) return "Promise { <state unknown> }";
    if (value instanceof WeakMap || value instanceof WeakSet) return `${constructorName(value) || (value instanceof WeakMap ? "WeakMap" : "WeakSet")} { <items unknown> }`;
    if (value instanceof ArrayBuffer || (typeof SharedArrayBuffer !== "undefined" && value instanceof SharedArrayBuffer)) {
        return `${constructorName(value) || "ArrayBuffer"} ${bufferOf(value)}`;
    }
    if (value instanceof DataView) {
        return `DataView { [byteLength]: ${value.byteLength}, [byteOffset]: ${value.byteOffset}, [buffer]: ${constructorName(value.buffer) || "ArrayBuffer"} ${bufferOf(value.buffer)} }`;
    }
    if (Array.isArray(value)) {
        if (nested) return "[Array]";
        const name = constructorName(value);
        const prefix = name === "Array" || name === "" ? "" : name === null ? "[Array: null prototype] " : `${name}(${value.length}) `;
        const hidden = context.hidden ? [`[length]: ${value.length}`] : [];
        return braced(prefix, [...listed(value, level, context, indentation), ...properties(value, level, context, indentation, isIndex), ...hidden], "[", "]");
    }
    if (isTypedArray(value)) {
        const name = constructorName(value) || "TypedArray";
        if (nested) return `[${name}]`;
        return braced(`${name}(${value.length}) `, listed(value, level, context, indentation), "[", "]");
    }
    if (value instanceof Map || value instanceof Set) {
        const kind = value instanceof Map ? "Map" : "Set";
        const name = constructorName(value);
        if (nested) return `[${name === null || name === "" ? kind : name}]`;
        const prefix = name === kind || name === "" ? `${kind}(${value.size}) ` : `${name ?? kind}(${value.size}) [${kind}] `;
        const parts = value instanceof Map
            ? entriesOf(value, value.size, ([key, item]: [unknown, unknown]) => `${write(key, level + 1, context, indentation + 2)} => ${write(item, level + 1, context, indentation + 2)}`)
            : entriesOf(value, value.size, (item: unknown) => write(item, level + 1, context, indentation + 2));
        return braced(prefix, parts);
    }
    const name = constructorName(value);
    const prefix = name === null ? "[Object: null prototype] " : name === "Object" || name === "" ? "" : `${name} `;
    if (nested) return `[${prefix === "" ? "Object" : prefix.trim()}]`;
    return braced(prefix, properties(value, level, context, indentation, () => false));
};

const contextOf = (depth = defaultDepth, hidden = false): Context => ({ depth, hidden, circular: new Map(), path: [] });

/** A value as the console writes it within a line: strings quoted. */
export const inspect = (value: unknown, depth = defaultDepth): string => write(value, 0, contextOf(depth));

/** A value as the console writes it on its own: a string as it is. */
const written = (value: unknown): string => typeof value === "string" ? value : inspect(value);

/** The prototypes of the built-in classes, whose `toString` `%s` doesn't call. */
const builtIns: ReadonlySet<unknown> = new Set([
    Object, Error, Array, Map, Set, Date, RegExp, Function, Number, Boolean, String, Symbol, BigInt, Promise, ArrayBuffer, DataView, WeakMap, WeakSet,
    Object.getPrototypeOf(Uint8Array),
].map(constructor => constructor.prototype));

/** Whether an object has a `toString` of its own or its class's, which `%s` calls, rather than a built-in class's. */
const ownToString = (value: object): boolean => tryRead(() => {
    for (let object: object | null = value; object !== null; object = Object.getPrototypeOf(object)) {
        if (Object.prototype.hasOwnProperty.call(object, "toString")) return !builtIns.has(object);
    }
    return false;
}, false);

const numberOf = (value: unknown, read: (value: unknown) => number): string => {
    if (typeof value === "bigint") return `${value}n`;
    if (typeof value === "symbol") return "NaN";
    const number = tryRead(() => read(value), Number.NaN);
    return Object.is(number, -0) ? "-0" : String(number);
};

/** What a format specifier writes for `value`, as node's `formatWithOptions` does. */
const specified = (specifier: string, value: unknown): string => {
    switch (specifier) {
        case "s":
            if (typeof value === "string") return value;
            if (typeof value !== "object" || value === null) return write(value, 0, contextOf());
            if (!(value instanceof Date) && ownToString(value)) return tryRead(() => String(value), inspect(value, 0));
            return inspect(value, 0);
        case "d": return numberOf(value, Number);
        case "i": return numberOf(value, item => Number.parseInt(String(item)));
        case "f": return numberOf(value, item => Number.parseFloat(String(item)));
        case "j": return tryRead(() => JSON.stringify(value) ?? "undefined", "[Circular]");
        case "o": return write(value, 0, contextOf(4, true));
        case "O": return inspect(value);
        default: return "";
    }
};

/**
 * A console call's values as one line, as node writes it: a first string's `%s`, `%d`, `%i`, `%f`, `%j`, `%o`, `%O`
 * and `%c` take the values after it, `%%` is a percent sign, and the rest follow, strings as they are.
 */
export const formatLine = (values: readonly unknown[]): string => {
    const [first, ...rest] = values;
    if (typeof first !== "string" || rest.length === 0) return values.map(written).join(" ");
    let next = 0;
    const formatted = first.replace(/%([sdifjoOc%])/g, (whole, specifier: string) => {
        if (specifier === "%") return "%";
        if (next >= rest.length) return whole;
        return specified(specifier, rest[next++]);
    });
    return [formatted, ...rest.slice(next).map(written)].join(" ");
};

/** Rows of `data` as node's `console.table` draws them: an index column, a column per key, and `Values` for the rest. */
export const formatTable = (data: unknown, only?: readonly string[]): string => {
    if (typeof data !== "object" || data === null) return formatLine([data]);
    const columns: string[] = [];
    const rows: { readonly index: string; readonly cells: Map<string, string>; readonly value: string | null }[] = [];
    let values = false;
    const entries: [unknown, unknown][] = data instanceof Map ? [...data] : tryRead(() => Object.entries(data), []);
    for (const [index, row] of entries) {
        const cells = new Map<string, string>();
        let value: string | null = null;
        if (typeof row === "object" && row !== null) {
            for (const [key, cell] of tryRead(() => Object.entries(row), [])) {
                if (only !== undefined && !only.includes(key)) continue;
                if (!columns.includes(key)) columns.push(key);
                cells.set(key, inspect(cell, 1));
            }
        } else {
            value = inspect(row, 1);
            values = true;
        }
        rows.push({ index: written(index), cells, value });
    }
    const headers = ["(index)", ...columns, ...values ? ["Values"] : []];
    const table = rows.map(row => [row.index, ...columns.map(column => row.cells.get(column) ?? ""), ...values ? [row.value ?? ""] : []]);
    const widths = headers.map((header, column) => Math.max(header.length, ...table.map(cells => cells[column]?.length ?? 0)) + 2);
    const line = (left: string, middle: string, right: string): string => `${left}${widths.map(width => "─".repeat(width)).join(middle)}${right}`;
    const cellsOf = (cells: readonly string[]): string => `│${cells.map((cell, column) => ` ${cell.padEnd((widths[column] ?? 2) - 2)} `).join("│")}│`;
    return [line("┌", "┬", "┐"), cellsOf(headers), line("├", "┼", "┤"), ...table.map(cellsOf), line("└", "┴", "┘")].join("\n");
};
