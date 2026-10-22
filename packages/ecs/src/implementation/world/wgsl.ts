// © 2026 Adobe. MIT License. See /LICENSE for details.
import { laneCount } from './intrinsics.js';
import type { Program } from './kernel.js';
import type { WasmColumn, WasmScalar } from './wasm.js';

type Expression = Program.Expression;
type Statement = Program.Statement;

/**
 * A kernel as a WGSL compute shader over the GPU copy of the arena. Numbers are f32, and integer reads and bitwise
 * results stay i32 or u32: results are not bit-exact with JS. Each dispatch reads a parameter record of `u32` words: the row count, then each column's word address in
 * this archetype, then the scalars as f32 bits.
 */
export type WgslKernel = {
    readonly code: string;
    /** Which resource and args leaves follow the column addresses, as in `WasmKernel.scalars`. */
    readonly scalars: readonly WasmScalar[];
};

/**
 * A local's WGSL identifier: its JS name with characters WGSL doesn't allow replaced. JS names end in `_<unique number>`,
 * so they stay unique and never collide with WGSL keywords or the shader's other names.
 */
const identifier = (name: string): string => {
    const safe = name.replace(/[^A-Za-z0-9_]/g, "_");
    return safe.startsWith("_") ? `v${safe}` : safe;
};

/** A WGSL value type's element type. */
const elementKind = (type: Program.ValueType): "f32" | "i32" | "u32" =>
    type === "i32" || type.endsWith("i") ? "i32" : type === "u32" || type.endsWith("u") ? "u32" : "f32";

/** A lane of a value: the value itself, a vector component, or a matrix element by column and row. */
const laneOf = (variable: string, type: Program.ValueType, lane: number): string =>
    type === "mat4x4f" ? `${variable}[${lane >> 2}][${lane & 3}]` : laneCount(type) === 1 ? variable : `${variable}.${"xyzw"[lane]}`;

type Region = Extract<Statement, { kind: "intrinsic" }>;

/** Locals an expression reads. A lane reads its region's result, not its value. */
const localsIn = (expression: Expression, into: Set<number>): void => {
    switch (expression.kind) {
        case "local": into.add(expression.local); return;
        case "unary": localsIn(expression.operand, into); return;
        case "binary": case "logical": localsIn(expression.left, into); localsIn(expression.right, into); return;
        case "conditional": for (const item of [expression.test, expression.consequent, expression.alternate]) localsIn(item, into); return;
        case "math": for (const item of expression.arguments) localsIn(item, into); return;
        default: return;
    }
};

/** Locals the shader uses: those intrinsic bodies alone use aren't emitted. */
const usedLocals = (body: readonly Statement[], into: Set<number> = new Set()): Set<number> => {
    for (const statement of body) {
        switch (statement.kind) {
            case "set": into.add(statement.local); localsIn(statement.value, into); break;
            case "store": localsIn(statement.value, into); break;
            case "if": localsIn(statement.test, into); usedLocals(statement.consequent, into); usedLocals(statement.alternate, into); break;
            case "intrinsic": for (const lanes of statement.operands) for (const lane of lanes) localsIn(lane, into); break;
            default: break;
        }
    }
    return into;
};

const regionsOf = (body: readonly Statement[]): Region[] => body.flatMap(statement =>
    statement.kind === "intrinsic" ? [statement] : statement.kind === "if" ? [...regionsOf(statement.consequent), ...regionsOf(statement.alternate)] : []);

/** Rows per workgroup, and workgroups per dispatch dimension: WebGPU's default limit. */
export const workgroupSize = 64;
export const maximumWorkgroups = 65535;

/** Thrown to end generation with the reason a kernel can't run on the GPU. */
type Unsupported = { readonly unsupported: string };
const fail = (reason: string): never => {
    const unsupported: Unsupported = { unsupported: reason };
    throw unsupported;
};
const isUnsupported = (error: unknown): error is Unsupported =>
    typeof error === "object" && error !== null && "unsupported" in error && typeof error.unsupported === "string";

/**
 * An emitted value and its WGSL type. Integer column reads and bitwise results stay `i32` or `u32`, so integer chains
 * keep every bit; arithmetic converts to f32. `literal` keeps a number literal's exact value for integer use.
 */
type Kind = "f32" | "bool" | "i32" | "u32";
type Value = { readonly code: string; readonly type: Kind; readonly literal?: number };

const f32 = (code: string): Value => ({ code, type: "f32" });
const bool = (code: string): Value => ({ code, type: "bool" });
const i32 = (code: string): Value => ({ code, type: "i32" });
const u32 = (code: string): Value => ({ code, type: "u32" });

/** JS `Number(value)`. */
const asNumber = (value: Value): string => {
    switch (value.type) {
        case "f32": return value.code;
        case "bool": return `select(0.0, 1.0, ${value.code})`;
        default: return `f32(${value.code})`;
    }
};

/** JS truthiness; for NaN, WGSL leaves it indeterminate. */
const asBool = (value: Value): string => {
    switch (value.type) {
        case "bool": return value.code;
        case "f32": return `(${value.code} != 0.0)`;
        case "i32": return `(${value.code} != 0i)`;
        case "u32": return `(${value.code} != 0u)`;
    }
};

/** JS `ToUint32`, as bits. */
const asUint = (value: Value): string => {
    if (value.literal !== undefined && Number.isFinite(value.literal)) return `${value.literal >>> 0}u`;
    switch (value.type) {
        case "u32": return value.code;
        case "i32": return `bitcast<u32>(${value.code})`;
        case "bool": return `select(0u, 1u, ${value.code})`;
        case "f32": return `toUint32(${value.code})`;
    }
};

/** JS `ToInt32`. */
const asInt = (value: Value): string => value.type === "i32" ? value.code : `bitcast<i32>(${asUint(value)})`;

const literal = (value: number): string => {
    // Constant expressions can't be NaN or infinite, so these come from private variables.
    if (Number.isNaN(value)) return "bitcast<f32>(nanBits)";
    if (Math.abs(value) > 3.4028234663852886e38) return value > 0 ? "bitcast<f32>(infinityBits)" : "(-bitcast<f32>(infinityBits))";
    // Below f32's smallest normal: flush rather than fail as an unrepresentable literal.
    if (value !== 0 && Math.abs(value) < 1.1754943508222875e-38) return "0.0";
    const text = Number.isInteger(value) && Math.abs(value) < 2 ** 53 ? value.toFixed(1) : value.toExponential();
    return value < 0 ? `(${text}f)` : `${text}f`;
};

/** `Math` functions with a WGSL equivalent, by argument count. */
const unaryMath: { readonly [name: string]: string } = {
    abs: "abs", sqrt: "sqrt", floor: "floor", ceil: "ceil", trunc: "trunc", sin: "sin", cos: "cos", tan: "tan",
    asin: "asin", acos: "acos", atan: "atan", sinh: "sinh", cosh: "cosh", tanh: "tanh", asinh: "asinh", acosh: "acosh",
    atanh: "atanh", exp: "exp", log: "log",
    log2: "log2", sign: "sign", fround: "",
};

/**
 * JS semantics where WGSL's differ for finite values. Where they differ only for NaN or infinite inputs or results,
 * WGSL leaves the result indeterminate and its own operation is used.
 */
const helpers = `
var<private> nanBits: u32 = 0x7fc00000u;
var<private> infinityBits: u32 = 0x7f800000u;
fn toUint32(x: f32) -> u32 {
    let t = abs(trunc(x));
    let wrapped = u32(t - 4294967296.0 * floor(t / 4294967296.0));
    return select(wrapped, 0u - wrapped, x < 0.0);
}
fn power(a: f32, b: f32) -> f32 {
    if (b == 0.0) { return 1.0; }
    if (a >= 0.0) { return pow(a, b); }
    let magnitude = pow(-a, b);
    return select(magnitude, -magnitude, fract(b * 0.5) != 0.0);
}
fn roundHalfUp(x: f32) -> f32 { let down = floor(x); return select(down, down + 1.0, x - down >= 0.5); }
`;

/**
 * Generates a compute shader for a kernel program, or the reason it can't run on the GPU: lookups, loops, f64 or
 * entity columns, or byte stores.
 */
export const generateWgsl = (program: Program, columns: readonly WasmColumn[], scalarTypes: (scalar: WasmScalar) => unknown, upColumns: readonly WasmColumn[] = []): WgslKernel | string => {
    /**
     * Reading `up`, a dispatch's record has, after the columns, the word addresses of its rows and their parents' rows,
     * whether they have a parent, and each parent column's address; the scalars follow.
     */
    const upMode = program.up === true;
    const upWords = upMode ? 3 + upColumns.length : 0;
    const upWord = (index: number): string => `parameters[${1 + columns.length + index}]`;
    if ((program.reductions?.length ?? 0) > 0) return "it uses reductions";
    const scalars: WasmScalar[] = [];
    const scalarIndex = new Map<string, number>();
    const scalarOf = (scalar: WasmScalar): number => {
        const key = JSON.stringify(scalar);
        let index = scalarIndex.get(key);
        if (index === undefined) {
            if (scalarTypes(scalar) === null) return fail("a resource or argument value isn't a number or boolean");
            index = scalars.length;
            scalars.push(scalar);
            scalarIndex.set(key, index);
        }
        return index;
    };
    /** The parameter word holding column `k`'s word address. */
    const base = (column: number): string => `parameters[${1 + column}]`;
    /** Word index of a 4-byte aligned element of column `k` in the current row. */
    const word = (column: number): string => {
        const { stride, offset } = columns[column];
        if (stride % 4 !== 0 || offset % 4 !== 0) return fail("a component isn't laid out in 4-byte words");
        return `${base(column)} + row * ${stride / 4}u + ${offset / 4}u`;
    };

    /** A 4-byte element of a column, of the row's or, for `up`, of its parent's, at `index`. */
    const readElement = ({ view, boolean }: WasmColumn, address: () => string): Value => {
        if (view === "u8") return fail("it reads a byte value, such as a boolean in the CPU layout; give the component a \"storage\" layout");
        const element = `memory[${address()}]`;
        if (boolean) return bool(`${element} != 0u`);
        switch (view) {
            case "f32": return f32(`bitcast<f32>(${element})`);
            case "u32": return u32(element);
            case "i32": return i32(`bitcast<i32>(${element})`);
            default: return fail("it reads an f64 value, such as an entity or a precision-2 number");
        }
    };
    const read = (column: number): Value => readElement(columns[column], () => word(column));
    const readUp = (column: number): Value => {
        const { stride, offset } = upColumns[column];
        return readElement(upColumns[column], () => stride % 4 !== 0 || offset % 4 !== 0 ? fail("a component isn't laid out in 4-byte words") : `${upWord(3 + column)} + parent * ${stride / 4}u + ${offset / 4}u`);
    };

    const store = (column: number, value: Value): string => {
        const { view, boolean, muted } = columns[column];
        if (muted === true) return "";
        if (boolean) return fail("it writes a boolean component");
        const target = `memory[${word(column)}]`;
        switch (view) {
            case "f32": return `${target} = bitcast<u32>(${asNumber(value)});`;
            case "u32": case "i32": return `${target} = ${asUint(value)};`;
            default: return fail("it writes an f64 or byte value");
        }
    };

    const shift = (value: Value): string => `(${asUint(value)} & 31u)`;
    const localName = (local: number): string => identifier(program.names?.[local] ?? `l_${local}`);
    const regions = new Map(regionsOf(program.body).map(region => [region.id, region]));
    const regionName = (region: Region): string => identifier(`${region.name}_${region.id}`);

    /** Each local's type: an integer type when every assignment has it, else f32 (booleans as 0 or 1). */
    const localKinds: Kind[] = new Array<Kind>(program.locals).fill("f32");
    const assigned: (Kind | undefined)[] = new Array<Kind | undefined>(program.locals);
    const kindOf = (expression: Expression): Kind => {
        switch (expression.kind) {
            case "column": case "upLeaf": {
                const column = expression.kind === "upLeaf" ? upColumns[expression.column] : columns[expression.column];
                return column === undefined ? "f32" : column.boolean ? "bool" : column.view === "u32" ? "u32" : column.view === "i32" ? "i32" : "f32";
            }
            case "upFound": return "bool";
            case "local": return localKinds[expression.local];
            case "unary": return expression.operator === "!" ? "bool" : expression.operator === "~" ? "i32" : "f32";
            case "binary":
                switch (expression.operator) {
                    case "&": case "|": case "^": case "<<": case ">>": return "i32";
                    case ">>>": return "u32";
                    case "<": case ">": case "<=": case ">=": case "==": case "!=": case "===": case "!==": return "bool";
                    default: return "f32";
                }
            case "logical": case "conditional": {
                const [a, b] = expression.kind === "logical" ? [expression.left, expression.right] : [expression.consequent, expression.alternate];
                const left = kindOf(a);
                return left === kindOf(b) ? left : "f32";
            }
            case "math": return expression.name === "clz32" ? "u32" : expression.name === "imul" ? "i32" : "f32";
            case "lane": {
                const region = regions.get(expression.intrinsic);
                return region === undefined ? "f32" : elementKind(region.intrinsic.result);
            }
            case "boolean": return "bool";
            default: return "f32";
        }
    };
    const infer = (body: readonly Statement[]): void => {
        for (const statement of body) {
            if (statement.kind === "set") {
                const kind = kindOf(statement.value);
                const current = assigned[statement.local];
                assigned[statement.local] = current === undefined || current === kind ? kind : "f32";
            }
            else if (statement.kind === "if") {
                infer(statement.consequent);
                infer(statement.alternate);
            }
        }
    };
    for (let pass = 0; pass <= program.locals; pass++) {
        assigned.fill(undefined);
        infer(program.body);
        let changed = false;
        assigned.forEach((kind, local) => {
            const next = kind === "i32" || kind === "u32" ? kind : "f32";
            if (next !== localKinds[local]) {
                localKinds[local] = next;
                changed = true;
            }
        });
        if (!changed) break;
    }

    /** Compares integers of one type exactly, and anything else as numbers. */
    const compare = (operator: string, left: Value, right: Value): Value => {
        const integer = left.type === "i32" || left.type === "u32" ? left.type : right.type === "i32" || right.type === "u32" ? right.type : null;
        const fits = (value: Value): boolean => value.type === integer
            || (value.literal !== undefined && Number.isInteger(value.literal) && (integer === "u32" ? value.literal >= 0 && value.literal <= 0xFFFFFFFF : Math.abs(value.literal) <= 0x7FFFFFFF));
        if (integer !== null && fits(left) && fits(right)) {
            const as = (value: Value): string => integer === "u32" ? asUint(value) : asInt(value);
            return bool(`(${as(left)} ${operator} ${as(right)})`);
        }
        return bool(`(${asNumber(left)} ${operator} ${asNumber(right)})`);
    };

    const emit = (expression: Expression): Value => {
        switch (expression.kind) {
            case "number": return { code: literal(expression.value), type: "f32", literal: expression.value };
            case "boolean": return bool(String(expression.value));
            case "column": return read(expression.column);
            case "upLeaf": return readUp(expression.column);
            case "upFound": return bool(`(${upWord(2)} != 0u)`);
            case "resource": case "args": {
                const scalar: WasmScalar = expression.kind === "args" ? { source: "args", path: expression.path } : { source: "resource", index: expression.index, path: expression.path };
                return f32(`bitcast<f32>(parameters[${1 + columns.length + upWords + scalarOf(scalar)}])`);
            }
            case "local": return { code: localName(expression.local), type: localKinds[expression.local] };
            case "unary": {
                const operand = emit(expression.operand);
                switch (expression.operator) {
                    case "-": return f32(`(-${asNumber(operand)})`);
                    case "+": return f32(asNumber(operand));
                    case "!": return bool(`(!${asBool(operand)})`);
                    case "~": return i32(`(~${asInt(operand)})`);
                }
                return fail("it uses an unsupported operator");
            }
            case "binary": {
                const left = emit(expression.left);
                const right = emit(expression.right);
                const a = asNumber(left);
                const b = asNumber(right);
                switch (expression.operator) {
                    case "+": case "-": case "*": case "/": return f32(`(${a} ${expression.operator} ${b})`);
                    case "%": return f32(`(${a} % ${b})`);
                    case "**": return f32(`power(${a}, ${b})`);
                    case "<": case ">": case "<=": case ">=": return compare(expression.operator, left, right);
                    case "==": case "===": return compare("==", left, right);
                    case "!=": case "!==": return compare("!=", left, right);
                    case "&": case "|": case "^": return i32(`(${asInt(left)} ${expression.operator} ${asInt(right)})`);
                    case "<<": return i32(`(${asInt(left)} << ${shift(right)})`);
                    case ">>": return i32(`(${asInt(left)} >> ${shift(right)})`);
                    case ">>>": return u32(`(${asUint(left)} >> ${shift(right)})`);
                }
                return fail("it uses an unsupported operator");
            }
            case "logical": {
                const left = emit(expression.left);
                const right = emit(expression.right);
                if (left.type === "bool" && right.type === "bool") return bool(`(${left.code} ${expression.operator} ${right.code})`);
                const same = left.type === right.type && left.type !== "bool";
                const a = same ? left.code : asNumber(left);
                const b = same ? right.code : asNumber(right);
                const type = same ? left.type : "f32";
                // JS returns an operand: `a && b` is `b` when `a` is truthy, `a || b` is `a` when it is.
                return { code: expression.operator === "&&" ? `select(${a}, ${b}, ${asBool(left)})` : `select(${b}, ${a}, ${asBool(left)})`, type };
            }
            case "conditional": {
                const test = asBool(emit(expression.test));
                const consequent = emit(expression.consequent);
                const alternate = emit(expression.alternate);
                if (consequent.type === alternate.type) return { code: `select(${alternate.code}, ${consequent.code}, ${test})`, type: consequent.type };
                return f32(`select(${asNumber(alternate)}, ${asNumber(consequent)}, ${test})`);
            }
            case "math": {
                const values = expression.arguments.map(emit);
                const items = values.map(asNumber);
                const name = expression.name;
                if (values.length === 1 && name === "clz32") return u32(`countLeadingZeros(${asUint(values[0])})`);
                if (values.length === 2 && name === "imul") return i32(`(${asInt(values[0])} * ${asInt(values[1])})`);
                if (items.length === 1 && unaryMath[name] !== undefined) return f32(unaryMath[name] === "" ? items[0] : `${unaryMath[name]}(${items[0]})`);
                if (items.length === 1 && name === "round") return f32(`roundHalfUp(${items[0]})`);
                if (items.length === 1 && name === "log10") return f32(`(log(${items[0]}) * 0.4342944819032518)`);
                if (items.length === 1 && name === "cbrt") return f32(`(sign(${items[0]}) * pow(abs(${items[0]}), 1.0 / 3.0))`);
                if (items.length === 2 && (name === "min" || name === "max")) return f32(`${name}(${items[0]}, ${items[1]})`);
                if (items.length === 2 && name === "atan2") return f32(`atan2(${items[0]}, ${items[1]})`);
                if (items.length === 2 && name === "pow") return f32(`power(${items[0]}, ${items[1]})`);
                if (items.length === 2 && name === "hypot") return f32(`length(vec2f(${items[0]}, ${items[1]}))`);
                return fail(`it uses Math.${name}, which GPU kernels don't support`);
            }
            case "lane": {
                const region = regions.get(expression.intrinsic);
                if (region === undefined) return emit(expression.value);
                const code = laneOf(regionName(region), region.intrinsic.result, expression.lane);
                return { code, type: elementKind(region.intrinsic.result) };
            }
            default: return fail("it uses lookups");
        }
    };

    /** An intrinsic's operand: an earlier region's whole result, or a value built from its lanes. */
    const operand = (lanes: readonly Expression[], type: Program.ValueType): string => {
        const [first] = lanes;
        const source = first?.kind === "lane" ? regions.get(first.intrinsic) : undefined;
        if (source !== undefined && source.intrinsic.result === type
            && lanes.every((lane, index) => lane.kind === "lane" && lane.intrinsic === source.id && lane.lane === index)) {
            return regionName(source);
        }
        const kind = elementKind(type);
        const items = lanes.map(lane => {
            const value = emit(lane);
            return kind === "i32" ? asInt(value) : kind === "u32" ? asUint(value) : asNumber(value);
        });
        return laneCount(type) === 1 ? items[0] ?? "" : `${type}(${items.join(", ")})`;
    };

    const intrinsicCall = (region: Region): string => {
        const { operation, form, parameters } = region.intrinsic;
        const operands = region.operands.map((lanes, index) => operand(lanes, parameters[index] ?? "f32"));
        switch (form) {
            case "infix": return `(${operands.join(` ${operation} `)})`;
            case "prefix": return `(${operation}${operands[0] ?? ""})`;
            case "call": return `${operation}(${operands.join(", ")})`;
        }
    };

    const statements = (body: readonly Statement[], indent: string): string => body.map(statement => {
        switch (statement.kind) {
            case "set": {
                const value = emit(statement.value);
                const kind = localKinds[statement.local];
                return `${indent}${localName(statement.local)} = ${kind === "u32" ? asUint(value) : kind === "i32" ? asInt(value) : asNumber(value)};`;
            }
            case "store": return `${indent}${store(statement.column, emit(statement.value))}`;
            // The CPU stamps the whole column once per dispatch instead.
            case "stamp": return "";
            case "if":
                return `${indent}if (${asBool(emit(statement.test))}) {\n${statements(statement.consequent, `${indent}    `)}\n${indent}} else {\n${statements(statement.alternate, `${indent}    `)}\n${indent}}`;
            case "next": return `${indent}return;`;
            case "intrinsic": return `${indent}${regionName(statement)} = ${intrinsicCall(statement)};`;
            default: return fail("it uses loops, labeled blocks or lookups");
        }
    }).filter(line => line.trim() !== "").join("\n");

    try {
        const body = statements(program.body, "    ");
        const zero: { readonly [kind: string]: string } = { f32: "0.0", i32: "0i", u32: "0u" };
        const used = usedLocals(program.body);
        const locals = [
            ...localKinds.flatMap((kind, local) => used.has(local) ? [`    var ${localName(local)}: ${kind} = ${zero[kind]};`] : []),
            ...[...regions.values()].map(region => `    var ${regionName(region)}: ${region.intrinsic.result};`),
        ].join("\n");
        const code = `@group(0) @binding(0) var<storage, read_write> memory: array<u32>;
@group(0) @binding(1) var<storage, read> parameters: array<u32>;
${helpers}
fn kernelRow(row: u32${upMode ? ", parent: u32" : ""}) {
${locals}
${body}
}

@compute @workgroup_size(${workgroupSize})
fn main(@builtin(global_invocation_id) id: vec3u, @builtin(num_workgroups) groups: vec3u) {
    let ${upMode ? "slot" : "row"} = id.x + id.y * groups.x * ${workgroupSize}u;
    if (${upMode ? "slot" : "row"} >= parameters[0]) { return; }
    ${upMode ? `kernelRow(memory[${upWord(0)} + slot], memory[${upWord(1)} + slot]);` : "kernelRow(row);"}
}
`;
        return { code, scalars };
    }
    catch (error) {
        if (isUnsupported(error)) return error.unsupported;
        throw error;
    }
};
