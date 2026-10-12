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

/** JS truthiness. */
const asBool = (value: Value): string => {
    switch (value.type) {
        case "bool": return value.code;
        case "f32": return `truthy(${value.code})`;
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
    asin: "asin", acos: "acos", atan: "atan", sinh: "sinh", cosh: "cosh", tanh: "tanh", exp: "exp", log: "log",
    log2: "log2", sign: "sign", fround: "",
};

/** JS semantics where WGSL's differ. Compilers may fold `x == x`, so NaN tests read the bits. */
const helpers = `
var<private> nanBits: u32 = 0x7fc00000u;
var<private> infinityBits: u32 = 0x7f800000u;
fn isNan(x: f32) -> bool { return (bitcast<u32>(x) & 0x7fffffffu) > 0x7f800000u; }
fn isFinite(x: f32) -> bool { return (bitcast<u32>(x) & 0x7fffffffu) < 0x7f800000u; }
fn truthy(x: f32) -> bool { return x != 0.0 && !isNan(x); }
fn toUint32(x: f32) -> u32 {
    if (!isFinite(x)) { return 0u; }
    let t = abs(trunc(x));
    let wrapped = u32(t - 4294967296.0 * floor(t / 4294967296.0));
    return select(wrapped, 0u - wrapped, x < 0.0);
}
fn remainder(a: f32, b: f32) -> f32 {
    if (isFinite(a) && !isFinite(b) && !isNan(b)) { return a; }
    return a - b * trunc(a / b);
}
fn power(a: f32, b: f32) -> f32 {
    if (b == 0.0) { return 1.0; }
    if (a >= 0.0) { return pow(a, b); }
    if (fract(b) != 0.0) { return bitcast<f32>(nanBits); }
    let magnitude = pow(-a, b);
    return select(magnitude, -magnitude, fract(b * 0.5) != 0.0);
}
fn jsMin(a: f32, b: f32) -> f32 { return select(min(a, b), bitcast<f32>(nanBits), isNan(a) || isNan(b)); }
fn jsMax(a: f32, b: f32) -> f32 { return select(max(a, b), bitcast<f32>(nanBits), isNan(a) || isNan(b)); }
fn roundHalfUp(x: f32) -> f32 { let down = floor(x); return select(down, down + 1.0, x - down >= 0.5); }
`;

/**
 * Generates a compute shader for a kernel program, or the reason it can't run on the GPU: lookups, loops, f64 or
 * entity columns, or byte stores.
 */
export const generateWgsl = (program: Program, columns: readonly WasmColumn[], scalarTypes: (scalar: WasmScalar) => unknown): WgslKernel | string => {
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

    const read = (column: number): Value => {
        const { view, boolean } = columns[column];
        if (view === "u8") return fail("it reads a byte value, such as a boolean in the CPU layout; give the component a \"storage\" layout");
        const element = `memory[${word(column)}]`;
        if (boolean) return bool(`${element} != 0u`);
        switch (view) {
            case "f32": return f32(`bitcast<f32>(${element})`);
            case "u32": return u32(element);
            case "i32": return i32(`bitcast<i32>(${element})`);
            default: return fail("it reads an f64 value, such as an entity or a precision-2 number");
        }
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

    /** Each local's type: an integer type when every assignment has it, else f32 (booleans as 0 or 1). */
    const localKinds: Kind[] = new Array<Kind>(program.locals).fill("f32");
    const assigned: (Kind | undefined)[] = new Array<Kind | undefined>(program.locals);
    const kindOf = (expression: Expression): Kind => {
        switch (expression.kind) {
            case "column": {
                const { view, boolean } = columns[expression.column];
                return boolean ? "bool" : view === "u32" ? "u32" : view === "i32" ? "i32" : "f32";
            }
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
            case "resource": case "args": {
                const scalar: WasmScalar = expression.kind === "args" ? { source: "args", path: expression.path } : { source: "resource", index: expression.index, path: expression.path };
                return f32(`bitcast<f32>(parameters[${1 + columns.length + scalarOf(scalar)}])`);
            }
            case "local": return { code: `l${expression.local}`, type: localKinds[expression.local] };
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
                    case "%": return f32(`remainder(${a}, ${b})`);
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
                if (items.length === 2 && name === "min") return f32(`jsMin(${items[0]}, ${items[1]})`);
                if (items.length === 2 && name === "max") return f32(`jsMax(${items[0]}, ${items[1]})`);
                if (items.length === 2 && name === "atan2") return f32(`atan2(${items[0]}, ${items[1]})`);
                if (items.length === 2 && name === "pow") return f32(`power(${items[0]}, ${items[1]})`);
                if (items.length === 2 && name === "hypot") return f32(`length(vec2f(${items[0]}, ${items[1]}))`);
                return fail(`it uses Math.${name}, which GPU kernels don't support`);
            }
            default: return fail("it uses lookups");
        }
    };

    const statements = (body: readonly Statement[], indent: string): string => body.map(statement => {
        switch (statement.kind) {
            case "set": {
                const value = emit(statement.value);
                const kind = localKinds[statement.local];
                return `${indent}l${statement.local} = ${kind === "u32" ? asUint(value) : kind === "i32" ? asInt(value) : asNumber(value)};`;
            }
            case "store": return `${indent}${store(statement.column, emit(statement.value))}`;
            // The CPU stamps the whole column once per dispatch instead.
            case "stamp": return "";
            case "if":
                return `${indent}if (${asBool(emit(statement.test))}) {\n${statements(statement.consequent, `${indent}    `)}\n${indent}} else {\n${statements(statement.alternate, `${indent}    `)}\n${indent}}`;
            case "next": return `${indent}return;`;
            default: return fail("it uses loops, labeled blocks or lookups");
        }
    }).filter(line => line.trim() !== "").join("\n");

    try {
        const zero: { readonly [kind: string]: string } = { f32: "0.0", i32: "0i", u32: "0u" };
        const locals = localKinds.map((kind, local) => `    var l${local}: ${kind} = ${zero[kind]};`).join("\n");
        const body = statements(program.body, "    ");
        const code = `@group(0) @binding(0) var<storage, read_write> memory: array<u32>;
@group(0) @binding(1) var<storage, read> parameters: array<u32>;
${helpers}
fn kernelRow(row: u32) {
${locals}
${body}
}

@compute @workgroup_size(${workgroupSize})
fn main(@builtin(global_invocation_id) id: vec3u, @builtin(num_workgroups) groups: vec3u) {
    let row = id.x + id.y * groups.x * ${workgroupSize}u;
    if (row >= parameters[0]) { return; }
    kernelRow(row);
}
`;
        return { code, scalars };
    }
    catch (error) {
        if (isUnsupported(error)) return error.unsupported;
        throw error;
    }
};
