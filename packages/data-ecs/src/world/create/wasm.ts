import { chunkShift, type Program } from './kernel.js';
import type { View } from '../../layout/layout.js';
import { withoutIntrinsics } from './intrinsics.js';

type Expression = Program.Expression;
type Statement = Program.Statement;

/** What a value is, for strict equality: JS `true === 1` is false, but both are 1 here. */
export type Type = "number" | "boolean" | "mixed";

/**
 * Where column `k`'s value for a row is: at its address plus `row * stride + offset` bytes, through `view`.
 * Entity and tick columns are dense f64. `boolean` columns read as 0 or 1.
 */
export type WasmColumn = {
    readonly view: View;
    readonly stride: number;
    readonly offset: number;
    readonly boolean: boolean;
    /** Columns of one component share its bytes; -1 for entity and tick columns. */
    readonly component: number;
    /** A tick column nothing observes: its stamps are dropped. */
    readonly muted?: boolean;
};

/** A scalar parameter: a leaf of a resource or of `args`, in `scalars` order. */
export type WasmScalar = { readonly source: "resource"; readonly index: number; readonly path: readonly (number | string)[] } | { readonly source: "args"; readonly path: readonly (number | string)[] };

/**
 * A lookup's directory in shared memory: one record of `1 + reads` i32 words per archetype id, a match flag, then the
 * column address of each component the lookup reads. `leaf` places a scalar leaf of read component `read`.
 */
export type WasmLookup = {
    readonly reads: number;
    readonly leaf: (read: number, path: readonly (number | string)[]) => Omit<WasmColumn, "component"> | null;
};

export type WasmKernel = {
    /** Compile asynchronously: browsers limit synchronous compiles on the main thread. */
    readonly bytes: Uint8Array;
    /** Which resource and args leaves the caller passes, after the column addresses. */
    readonly scalars: readonly WasmScalar[];
    /** The JS functions it imports, by name. */
    readonly imports: readonly string[];
    /** Whether it runs four rows at a time with SIMD, at storage precision. */
    readonly vectorized: boolean;
};

/** Math functions with exact native equivalents; the rest are imported from JS so results match bit for bit. */
const native = new Set(["abs", "sqrt", "floor", "ceil", "trunc", "min", "max", "fround", "imul", "clz32"]);

/** Imported operations that aren't `Math` functions. */
const operations: { readonly [name: string]: (a: number, b: number) => number } = {
    remainder: (a, b) => a % b,
    power: (a, b) => a ** b,
};

/** Reads each scalar parameter's value from the resources and args of a run; booleans become 0 or 1. */
export const scalarValues = (scalars: readonly WasmScalar[], resources: readonly unknown[], args: unknown): number[] =>
    scalars.map(scalar => {
        let value: unknown = scalar.source === "args" ? args : resources[scalar.index];
        for (const key of scalar.path) value = typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
        return Number(value);
    });

/** The `run` export of an instantiated kernel module: `lastRun` below 0 passes every row. */
export type WasmRun = (start: number, end: number, tick: number, lastRun: number, ...values: number[]) => void;

export const instantiateWasm = async (module: WebAssembly.Module, memory: WebAssembly.Memory, imports: readonly string[]): Promise<WasmRun> => {
    const instance = await WebAssembly.instantiate(module, { env: { memory }, math: importsOf(imports) });
    const run: unknown = instance.exports.run;
    if (typeof run !== "function") throw new Error("A WASM kernel has no run export.");
    // The generator always exports `run` with this signature.
    return run as WasmRun;
};

/** The JS functions a kernel's imports name. */
export const importsOf = (names: readonly string[]): { readonly [name: string]: (...values: number[]) => number } => {
    const functions: { [name: string]: (...values: number[]) => number } = {};
    for (const name of names) {
        const operation = operations[name];
        const math: unknown = Reflect.get(Math, name);
        if (operation !== undefined) functions[name] = operation;
        else if (typeof math === "function") functions[name] = (...values: number[]) => Number(Reflect.apply(math, Math, values));
    }
    return functions;
};

// Opcodes.
const op = {
    block: 0x02, loop: 0x03, if: 0x04, else: 0x05, end: 0x0b, br: 0x0c, brIf: 0x0d, call: 0x10, drop: 0x1a, select: 0x1b,
    localGet: 0x20, localSet: 0x21, localTee: 0x22,
    i32Load: 0x28, f32Load: 0x2a, f64Load: 0x2b, i32Load8u: 0x2d, i32Store: 0x36, f32Store: 0x38, f64Store: 0x39, i32Store8: 0x3a,
    i32Const: 0x41, f64Const: 0x44,
    i32Eqz: 0x45, i32GeS: 0x4e,
    f64Eq: 0x61, f64Ne: 0x62, f64Lt: 0x63, f64Gt: 0x64, f64Le: 0x65, f64Ge: 0x66,
    i32Eq: 0x46, i32LtS: 0x48, i32LeS: 0x4c, i32Clz: 0x67, i32Add: 0x6a, i32Sub: 0x6b, i32Mul: 0x6c, i32And: 0x71, i32Or: 0x72, i32Xor: 0x73, i32Shl: 0x74, i32ShrS: 0x75, i32ShrU: 0x76,
    f64Abs: 0x99, f64Neg: 0x9a, f64Ceil: 0x9b, f64Floor: 0x9c, f64Trunc: 0x9d, f64Sqrt: 0x9f,
    f64Add: 0xa0, f64Sub: 0xa1, f64Mul: 0xa2, f64Div: 0xa3, f64Min: 0xa4, f64Max: 0xa5,
    i32WrapI64: 0xa7, i32GeU: 0x4f, i32Ne: 0x47, i64Const: 0x42, i64ShrU: 0x88, i64RemS: 0x81, f64ConvertI64S: 0xb9, f64Copysign: 0xa6, f32DemoteF64: 0xb6, f64ConvertI32S: 0xb7, f64ConvertI32U: 0xb8, f64PromoteF32: 0xbb,
} as const;
const f64Type = 0x7c;
const i32Type = 0x7f;
/** Saturating truncations, 0xfc-prefixed opcodes. */
const i64TruncSatF64S = [0xfc, 0x06];
const truncations = { i32TruncSatF64U: [0xfc, 0x03], i64TruncSatF64U: [0xfc, 0x07] } as const;

const unsigned = (value: number): number[] => {
    const bytes: number[] = [];
    do {
        let byte = value & 0x7f;
        value = Math.floor(value / 128);
        if (value !== 0) byte |= 0x80;
        bytes.push(byte);
    } while (value !== 0);
    return bytes;
};

const signed = (value: number): number[] => {
    const bytes: number[] = [];
    for (;;) {
        const byte = value & 0x7f;
        value >>= 7;
        if ((value === 0 && (byte & 0x40) === 0) || (value === -1 && (byte & 0x40) !== 0)) return [...bytes, byte];
        bytes.push(byte | 0x80);
    }
};

const float64 = (value: number): number[] => [...new Uint8Array(new Float64Array([value]).buffer)];
const name = (text: string): number[] => {
    const bytes = [...new TextEncoder().encode(text)];
    return [...unsigned(bytes.length), ...bytes];
};
const vector = (items: readonly (readonly number[])[]): number[] => [...unsigned(items.length), ...items.flat()];
const section = (id: number, content: readonly number[]): number[] => [id, ...unsigned(content.length), ...content];


/** Thrown inside generation when a program needs something WASM can't match exactly; the JS kernel is used instead. */
const unsupported = Symbol("unsupported");
/** Thrown when a program can't run four rows at a time; the scalar loop handles every row instead. */
const notVectorizable = Symbol("notVectorizable");

const join = (a: Type, b: Type): Type => a === b ? a : "mixed";

/**
 * Generates a WASM module for a kernel program, with JS semantics: every value is an f64, and stores
 * convert as typed arrays do. Returns `null` when exact equivalence can't be guaranteed.
 *
 * The exported `run(start, end, tick, ...columnAddresses, ...scalars)` processes rows `start` to `end`.
 */
export const generateWasm = (
    source: Program,
    columns: readonly WasmColumn[],
    scalarTypes: (scalar: WasmScalar) => Type | null,
    simdEnabled = true,
    filters = 0,
    lookups: readonly WasmLookup[] = [],
    /** For a program reading `up`: the columns of the parent's components it reads. */
    upColumns: readonly WasmColumn[] = [],
): WasmKernel | null => {
    const program = withoutIntrinsics(source);
    const scalars: WasmScalar[] = [];
    const scalarIndex = new Map<string, number>();
    const imports: string[] = [];
    const scalarOf = (scalar: WasmScalar): number => {
        const key = JSON.stringify(scalar);
        let index = scalarIndex.get(key);
        if (index === undefined) {
            if (scalarTypes(scalar) === null) throw unsupported;
            index = scalars.length;
            scalars.push(scalar);
            scalarIndex.set(key, index);
        }
        return index;
    };
    const importOf = (functionName: string): number => {
        let index = imports.indexOf(functionName);
        if (index < 0) {
            index = imports.length;
            imports.push(functionName);
        }
        return index;
    };

    /** Each handle's lookup, from the `find`s into it; a handle used by two lookups isn't supported. */
    const lookupOfHandle = new Map<number, number>();
    const collectFinds = (statements: readonly Statement[]): void => {
        for (const statement of statements) {
            if (statement.kind === "find") {
                const existing = lookupOfHandle.get(statement.handle);
                if ((existing !== undefined && existing !== statement.lookup) || statement.lookup >= lookups.length) throw unsupported;
                lookupOfHandle.set(statement.handle, statement.lookup);
            }
            else if (statement.kind === "if") { collectFinds(statement.consequent); collectFinds(statement.alternate); }
            else if (statement.kind === "block" || statement.kind === "loop") collectFinds(statement.body);
        }
    };

    // Local types, to a fixed point over assignments.
    const localTypes: (Type | undefined)[] = new Array(program.locals);
    const typeOf = (expression: Expression): Type => {
        switch (expression.kind) {
            case "number": return "number";
            case "boolean": return "boolean";
            case "column": return columns[expression.column].boolean ? "boolean" : "number";
            case "resource": case "args": return scalarTypes(expression.kind === "args" ? { source: "args", path: expression.path } : { source: "resource", index: expression.index, path: expression.path }) ?? "mixed";
            case "local": return localTypes[expression.local] ?? "number";
            case "unary": return expression.operator === "!" ? "boolean" : "number";
            case "binary": return ["<", ">", "<=", ">=", "==", "!=", "===", "!=="].includes(expression.operator) ? "boolean" : "number";
            case "logical": return join(typeOf(expression.left), typeOf(expression.right));
            case "conditional": return join(typeOf(expression.consequent), typeOf(expression.alternate));
            case "math": return "number";
            case "found": case "upFound": return "boolean";
            case "upLeaf": return upColumns[expression.column]?.boolean === true ? "boolean" : "number";
            case "lookupLeaf": {
                const lookup = lookupOfHandle.get(expression.handle);
                const leaf = lookup === undefined ? null : lookups[lookup]?.leaf(expression.read, expression.path);
                return leaf?.boolean === true ? "boolean" : "number";
            }
            // Regions are inlined before generating.
            case "lane": throw unsupported;
        }
    };
    const inferLocals = (statements: readonly Statement[]): boolean => {
        let changed = false;
        for (const statement of statements) {
            if (statement.kind === "set") {
                const type = typeOf(statement.value);
                const current = localTypes[statement.local];
                const next = current === undefined ? type : join(current, type);
                if (next !== current) {
                    localTypes[statement.local] = next;
                    changed = true;
                }
            }
            else if (statement.kind === "if") changed = inferLocals(statement.consequent) || inferLocals(statement.alternate) || changed;
            else if (statement.kind === "block" || statement.kind === "loop") changed = inferLocals(statement.body) || changed;
        }
        return changed;
    };
    for (let pass = 0; pass < program.locals + 2 && inferLocals(program.body); pass++);

    /** Whether a value is an integer below 2^32 in magnitude: integer column reads, small integer literals, and locals of only those. */
    const accumulators = program.reductions ?? [];
    // Accumulators start at their partials, which needn't be integers.
    const integralLocals = new Array<boolean>(program.locals).fill(true).map((integral, index) => integral && !accumulators.includes(index));
    const integral = (expression: Expression): boolean => {
        switch (expression.kind) {
            case "column": {
                const { view, boolean } = columns[expression.column];
                return !boolean && (view === "i32" || view === "u32" || view === "u8");
            }
            case "upLeaf": {
                const column = upColumns[expression.column];
                return column !== undefined && !column.boolean && (column.view === "i32" || column.view === "u32" || column.view === "u8");
            }
            case "number": return Number.isInteger(expression.value) && Math.abs(expression.value) <= 0x7FFFFFFF;
            case "local": return integralLocals[expression.local];
            default: return false;
        }
    };
    const inferIntegral = (statements: readonly Statement[]): boolean => {
        let changed = false;
        for (const statement of statements) {
            if (statement.kind === "set" && integralLocals[statement.local] && !integral(statement.value)) {
                integralLocals[statement.local] = false;
                changed = true;
            }
            else if (statement.kind === "if") changed = inferIntegral(statement.consequent) || inferIntegral(statement.alternate) || changed;
            else if (statement.kind === "block" || statement.kind === "loop") changed = inferIntegral(statement.body) || changed;
        }
        return changed;
    };
    while (inferIntegral(program.body));

    // Parameters: start, end, tick, lastRun, column addresses, filter row tick addresses, filter chunk tick addresses, scalars, and with reductions the partials address.
    const columnParameter = (column: number): number => 4 + column;
    const filterRowParameter = (filter: number): number => 4 + columns.length + filter;
    const filterChunkParameter = (filter: number): number => 4 + columns.length + filters + filter;
    /**
     * With lookups: the entity table (archetype, row and generation addresses, then its length), then each lookup's
     * directory address and record count, all as f64 so workers pass them like scalars.
     */
    const lookupParameters = lookups.length === 0 ? 0 : 4 + 2 * lookups.length;
    const lookupParameter = (index: number): number => 4 + columns.length + 2 * filters + index;
    /** For `up`: the rows' and their parents' rows' addresses, whether there's a parent, then each parent column's address. */
    const upMode = program.up === true;
    const upParameters = upMode ? 3 + upColumns.length : 0;
    const upParameter = (index: number): number => 4 + columns.length + 2 * filters + lookupParameters + index;
    const scalarParameter = (index: number): number => 4 + columns.length + 2 * filters + lookupParameters + upParameters + index;
    const code: number[] = [];
    const extraLocals: number[] = [];
    let localBase = 0;
    const local = (index: number): number => localBase + index;
    const scratch = (type: number): number => {
        extraLocals.push(type);
        return localBase + program.locals + extraLocals.length - 1;
    };
    let rowLocal = 0;
    /** For `up`: the current row's parent row. */
    let parentLocal = 0;
    const address = (column: number): void => {
        code.push(op.localGet, ...unsigned(columnParameter(column)), op.localGet, ...unsigned(rowLocal), op.i32Const, ...signed(columns[column].stride), op.i32Mul, op.i32Add);
    };

    /** Leaves the JS `ToInt32` of the f64 on the stack as an i32: exact for every finite value; NaN and infinities give 0. */
    const emitToInt32 = (): void => {
        const value = scratch(f64Type);
        code.push(op.localTee, ...unsigned(value));
        code.push(op.localGet, ...unsigned(value), op.f64Const, ...float64(2 ** -32), op.f64Mul, op.f64Trunc, op.f64Const, ...float64(2 ** 32), op.f64Mul, op.f64Sub);
        code.push(...i64TruncSatF64S, op.i32WrapI64);
    };

    /** Leaves 1 (i32) if the f64 on the stack is truthy: not 0, -0 or NaN. */
    const emitTruthy = (type: Type): void => {
        if (type === "boolean") {
            code.push(op.f64Const, ...float64(0), op.f64Ne);
            return;
        }
        const value = scratch(f64Type);
        code.push(op.localTee, ...unsigned(value), op.f64Const, ...float64(0), op.f64Ne, op.localGet, ...unsigned(value), op.localGet, ...unsigned(value), op.f64Eq, op.i32And);
    };

    const emitCall = (functionName: string): void => {
        code.push(op.call, ...unsigned(importOf(functionName)));
    };

    const emit = (expression: Expression): void => {
        switch (expression.kind) {
            case "number": code.push(op.f64Const, ...float64(expression.value)); return;
            case "boolean": code.push(op.f64Const, ...float64(expression.value ? 1 : 0)); return;
            case "local": code.push(op.localGet, ...unsigned(local(expression.local))); return;
            case "resource": case "args": {
                const scalar: WasmScalar = expression.kind === "args" ? { source: "args", path: expression.path } : { source: "resource", index: expression.index, path: expression.path };
                code.push(op.localGet, ...unsigned(scalarParameter(scalarOf(scalar))));
                return;
            }
            case "upFound": code.push(op.localGet, ...unsigned(upParameter(2)), op.f64ConvertI32U); return;
            case "upLeaf": case "column": {
                const { view, offset, boolean } = expression.kind === "upLeaf" ? upColumns[expression.column] : columns[expression.column];
                if (expression.kind === "upLeaf") {
                    code.push(op.localGet, ...unsigned(upParameter(3 + expression.column)), op.localGet, ...unsigned(parentLocal), op.i32Const, ...signed(upColumns[expression.column].stride), op.i32Mul, op.i32Add);
                }
                else address(expression.column);
                const memory = (align: number): number[] => [align, ...unsigned(offset)];
                if (boolean) {
                    code.push(view === "u8" ? op.i32Load8u : op.i32Load, ...memory(view === "u8" ? 0 : 2), op.i32Const, 0, 0x47 /* i32.ne */, op.f64ConvertI32U);
                    return;
                }
                switch (view) {
                    case "f32": code.push(op.f32Load, ...memory(2), op.f64PromoteF32); return;
                    case "i32": code.push(op.i32Load, ...memory(2), op.f64ConvertI32S); return;
                    case "u32": code.push(op.i32Load, ...memory(2), op.f64ConvertI32U); return;
                    case "u8": code.push(op.i32Load8u, ...memory(0), op.f64ConvertI32U); return;
                    default: code.push(op.f64Load, ...memory(3)); return;
                }
            }
            case "unary":
                emit(expression.operand);
                if (expression.operator === "-") code.push(op.f64Neg);
                else if (expression.operator === "!") {
                    emitTruthy(typeOf(expression.operand));
                    code.push(op.i32Eqz, op.f64ConvertI32U);
                }
                else if (expression.operator === "~") {
                    emitToInt32();
                    code.push(op.i32Const, ...signed(-1), op.i32Xor, op.f64ConvertI32S);
                }
                return;
            case "binary": return emitBinary(expression);
            case "logical": {
                const type = typeOf(expression.left);
                const value = scratch(f64Type);
                emit(expression.left);
                code.push(op.localTee, ...unsigned(value));
                emitTruthy(type);
                code.push(op.if, f64Type);
                if (expression.operator === "&&") emit(expression.right);
                else code.push(op.localGet, ...unsigned(value));
                code.push(op.else);
                if (expression.operator === "&&") code.push(op.localGet, ...unsigned(value));
                else emit(expression.right);
                code.push(op.end);
                return;
            }
            case "conditional":
                emit(expression.test);
                emitTruthy(typeOf(expression.test));
                code.push(op.if, f64Type);
                emit(expression.consequent);
                code.push(op.else);
                emit(expression.alternate);
                code.push(op.end);
                return;
            case "math": return emitMath(expression.name, expression.arguments);
            case "found":
                code.push(op.localGet, ...unsigned(handleLocal(expression.handle, "found")), op.f64ConvertI32U);
                return;
            case "lookupLeaf": return emitLookupLeaf(expression.handle, expression.read, expression.path);
        }
    };

    const emitMath = (functionName: string, parameters: readonly Expression[]): void => {
        if (!native.has(functionName)) {
            // Imported functions take two f64s; unary ones ignore the second.
            if (parameters.length > 2) throw unsupported;
            for (const parameter of parameters) emit(parameter);
            for (let i = parameters.length; i < 2; i++) code.push(op.f64Const, ...float64(NaN));
            emitCall(functionName);
            return;
        }
        switch (functionName) {
            case "min": case "max": {
                if (parameters.length === 0) {
                    code.push(op.f64Const, ...float64(functionName === "min" ? Infinity : -Infinity));
                    return;
                }
                emit(parameters[0]);
                // JS converts every argument, so `Math.max(x)` is `+x`.
                for (const parameter of parameters.slice(1)) {
                    emit(parameter);
                    code.push(functionName === "min" ? op.f64Min : op.f64Max);
                }
                return;
            }
            case "imul":
                emit(parameters[0] ?? { kind: "number", value: 0 });
                emitToInt32();
                emit(parameters[1] ?? { kind: "number", value: 0 });
                emitToInt32();
                code.push(op.i32Mul, op.f64ConvertI32S);
                return;
            case "clz32":
                emit(parameters[0] ?? { kind: "number", value: 0 });
                emitToInt32();
                code.push(op.i32Clz, op.f64ConvertI32U);
                return;
            case "fround":
                emit(parameters[0] ?? { kind: "number", value: NaN });
                code.push(op.f32DemoteF64, op.f64PromoteF32);
                return;
            default: {
                emit(parameters[0] ?? { kind: "number", value: NaN });
                const unary = { abs: op.f64Abs, sqrt: op.f64Sqrt, floor: op.f64Floor, ceil: op.f64Ceil, trunc: op.f64Trunc }[functionName];
                if (unary === undefined) throw unsupported;
                code.push(unary);
            }
        }
    };

    const comparisons = { "<": op.f64Lt, ">": op.f64Gt, "<=": op.f64Le, ">=": op.f64Ge, "==": op.f64Eq, "!=": op.f64Ne, "===": op.f64Eq, "!==": op.f64Ne } as const;
    const arithmetic = { "+": op.f64Add, "-": op.f64Sub, "*": op.f64Mul, "/": op.f64Div } as const;
    const bitwise = { "&": op.i32And, "|": op.i32Or, "^": op.i32Xor, "<<": op.i32Shl, ">>": op.i32ShrS, ">>>": op.i32ShrU } as const;

    const emitBinary = (expression: Extract<Expression, { kind: "binary" }>): void => {
        const { operator, left, right } = expression;
        if (operator === "===" || operator === "!==") {
            const leftType = typeOf(left);
            const rightType = typeOf(right);
            if (leftType === "mixed" || rightType === "mixed") throw unsupported;
            // A boolean never strictly equals a number. Operands are pure, so they needn't be evaluated.
            if (leftType !== rightType) {
                code.push(op.f64Const, ...float64(operator === "===" ? 0 : 1));
                return;
            }
        }
        // Integers by a nonzero literal: i64 remainder is exact, and copysign gives JS's -0 for a negative dividend.
        if (operator === "%" && integral(left) && right.kind === "number" && right.value !== 0 && integral(right)) {
            const dividend = scratch(f64Type);
            emit(left);
            code.push(op.localTee, ...unsigned(dividend), ...i64TruncSatF64S, op.i64Const, ...signed(right.value), op.i64RemS, op.f64ConvertI64S, op.localGet, ...unsigned(dividend), op.f64Copysign);
            return;
        }
        if (operator === "%" || operator === "**") {
            emit(left);
            emit(right);
            emitCall(operator === "%" ? "remainder" : "power");
            return;
        }
        emit(left);
        if (operator in bitwise) {
            emitToInt32();
            emit(right);
            emitToInt32();
            code.push(bitwise[operator as keyof typeof bitwise]);
            code.push(operator === ">>>" ? op.f64ConvertI32U : op.f64ConvertI32S);
            return;
        }
        emit(right);
        if (operator in arithmetic) {
            code.push(arithmetic[operator as keyof typeof arithmetic]);
            return;
        }
        code.push(comparisons[operator as keyof typeof comparisons], op.f64ConvertI32U);
    };

    /** Labels from innermost: program blocks and loops count toward IR depths; `if`s and the row block don't. */
    const labels: ("program" | "if" | "next")[] = [];
    const wasmDepth = (depth: number): number => {
        let seen = -1;
        for (let i = labels.length - 1; i >= 0; i--) {
            if (labels[i] === "program" && ++seen === depth) return labels.length - 1 - i;
        }
        throw unsupported;
    };

    const store = (column: number, value: Expression | "tick"): void => {
        const { view, offset } = columns[column];
        address(column);
        if (value === "tick") code.push(op.localGet, 2);
        else emit(value);
        const memory = (align: number): number[] => [align, ...unsigned(offset)];
        switch (view) {
            case "f32": code.push(op.f32DemoteF64, op.f32Store, ...memory(2)); return;
            case "i32": case "u32": emitToInt32(); code.push(op.i32Store, ...memory(2)); return;
            case "u8": emitToInt32(); code.push(op.i32Store8, ...memory(0)); return;
            default: code.push(op.f64Store, ...memory(3)); return;
        }
    };

    /**
     * Chunk columns stamped by every row: top-level stamps with no `next` before them, in an unfiltered kernel.
     * Their chunks are stamped once per call, for the whole range, instead of on each row.
     */
    const everyRow = new Set<number>();
    // Listed rows needn't be consecutive, so each stamps its own chunk.
    if (filters === 0 && !upMode) {
        const ends = (statement: Statement): boolean =>
            statement.kind === "next" || (statement.kind === "if" && (statement.consequent.some(ends) || statement.alternate.some(ends)))
            || ((statement.kind === "block" || statement.kind === "loop") && statement.body.some(ends));
        for (const statement of program.body) {
            if (ends(statement)) break;
            if (statement.kind === "stamp" && columns[statement.chunks].muted !== true) everyRow.add(statement.chunks);
        }
    }
    /** Stamps every chunk from `start`'s to `end - 1`'s, for the chunk columns every row stamps. */
    const stampRangeChunks = (): void => {
        for (const chunks of everyRow) {
            const chunk = scratch(i32Type);
            const last = scratch(i32Type);
            // if (start < end) for (chunk = start >> shift; chunk <= (end - 1) >> shift; chunk++) chunks[chunk] = tick
            code.push(op.localGet, 0, op.localGet, 1, op.i32LtS, op.if, 0x40);
            code.push(op.localGet, 0, op.i32Const, ...signed(chunkShift), op.i32ShrU, op.localSet, ...unsigned(chunk));
            code.push(op.localGet, 1, op.i32Const, 1, op.i32Sub, op.i32Const, ...signed(chunkShift), op.i32ShrU, op.localSet, ...unsigned(last));
            code.push(op.loop, 0x40);
            code.push(op.localGet, ...unsigned(columnParameter(chunks)), op.localGet, ...unsigned(chunk), op.i32Const, 3, op.i32Shl, op.i32Add, op.localGet, 2, op.f64Store, 3, 0);
            code.push(op.localGet, ...unsigned(chunk), op.i32Const, 1, op.i32Add, op.localTee, ...unsigned(chunk), op.localGet, ...unsigned(last), op.i32LeS, op.brIf, 0);
            code.push(op.end, op.end);
        }
    };

    // ---- Lookups: a find checks the entity table and the lookup's directory record; leaves read through the record. ----

    /** i32 locals holding the lookup parameters, converted once per call. */
    let lookupLocals: number[] = [];
    const convertLookupParameters = (): void => {
        lookupLocals = [];
        for (let index = 0; index < lookupParameters; index++) {
            const target = scratch(i32Type);
            code.push(op.localGet, ...unsigned(lookupParameter(index)), ...truncations.i32TruncSatF64U, op.localSet, ...unsigned(target));
            lookupLocals.push(target);
        }
    };
    const entityArchetypes = (): number => lookupLocals[0];
    const entityRows = (): number => lookupLocals[1];
    const entityGenerations = (): number => lookupLocals[2];
    const entityCount = (): number => lookupLocals[3];
    const directory = (lookup: number): number => lookupLocals[4 + 2 * lookup];
    const directoryCount = (lookup: number): number => lookupLocals[5 + 2 * lookup];

    /** Per handle: whether found, the row, and the address of its directory record. */
    const handleLocals = new Map<string, number>();
    const handleLocal = (handle: number, part: "found" | "row" | "record"): number => {
        const key = `${handle}:${part}`;
        let index = handleLocals.get(key);
        if (index === undefined) handleLocals.set(key, index = scratch(i32Type));
        return index;
    };

    const emitFind = (handle: number, lookup: number, entity: Expression): void => {
        const found = handleLocal(handle, "found");
        const row = handleLocal(handle, "row");
        const record = handleLocal(handle, "record");
        const value = scratch(f64Type);
        const wide = scratch(0x7e);
        const generation = scratch(f64Type);
        const index = scratch(i32Type);
        const archetype = scratch(i32Type);
        const words = 1 + lookups[lookup].reads;
        code.push(op.i32Const, 0, op.localSet, ...unsigned(found));
        // As JS `locate`: the index is ToUint32 of the entity and the generation is floor(entity / 2^32), compared as
        // numbers, so negative, fractional and NaN entities behave exactly as they do there.
        emit(entity);
        code.push(op.localTee, ...unsigned(value));
        // Real entities are non-negative integers: one i64 gives both parts. Anything else takes the general path.
        code.push(...i64TruncSatF64S, op.localTee, ...unsigned(wide), op.f64ConvertI64S, op.localGet, ...unsigned(value), op.f64Eq);
        code.push(op.localGet, ...unsigned(value), op.f64Const, ...float64(0), op.f64Ge, op.i32And);
        code.push(op.if, 0x40);
        code.push(op.localGet, ...unsigned(wide), op.i32WrapI64, op.localSet, ...unsigned(index));
        code.push(op.localGet, ...unsigned(wide), op.i64Const, 32, op.i64ShrU, op.f64ConvertI64S, op.localSet, ...unsigned(generation));
        code.push(op.else);
        code.push(op.localGet, ...unsigned(value));
        emitToInt32();
        code.push(op.localSet, ...unsigned(index));
        code.push(op.localGet, ...unsigned(value), op.f64Const, ...float64(2 ** -32), op.f64Mul, op.f64Floor, op.localSet, ...unsigned(generation));
        code.push(op.end);
        code.push(op.block, 0x40);
        labels.push("if");
        code.push(op.localGet, ...unsigned(index), op.localGet, ...unsigned(entityCount()), op.i32GeU, op.brIf, 0);
        code.push(op.localGet, ...unsigned(entityGenerations()), op.localGet, ...unsigned(index), op.i32Const, 2, op.i32Shl, op.i32Add, op.i32Load, 2, 0, op.f64ConvertI32U);
        code.push(op.localGet, ...unsigned(generation), op.f64Ne, op.brIf, 0);
        code.push(op.localGet, ...unsigned(entityArchetypes()), op.localGet, ...unsigned(index), op.i32Const, 2, op.i32Shl, op.i32Add, op.i32Load, 2, 0, op.localTee, ...unsigned(archetype));
        code.push(op.i32Const, 0, op.i32LtS, op.brIf, 0);
        code.push(op.localGet, ...unsigned(archetype), op.localGet, ...unsigned(directoryCount(lookup)), op.i32GeS, op.brIf, 0);
        code.push(op.localGet, ...unsigned(directory(lookup)), op.localGet, ...unsigned(archetype), op.i32Const, ...signed(4 * words), op.i32Mul, op.i32Add, op.localTee, ...unsigned(record));
        code.push(op.i32Load, 2, 0, op.i32Eqz, op.brIf, 0);
        code.push(op.localGet, ...unsigned(entityRows()), op.localGet, ...unsigned(index), op.i32Const, 2, op.i32Shl, op.i32Add, op.i32Load, 2, 0, op.localSet, ...unsigned(row));
        code.push(op.i32Const, 1, op.localSet, ...unsigned(found));
        labels.pop();
        code.push(op.end);
    };

    const emitLookupLeaf = (handle: number, read: number, path: readonly (number | string)[]): void => {
        const lookup = lookupOfHandle.get(handle);
        const leaf = lookup === undefined ? null : lookups[lookup].leaf(read, path);
        if (leaf === null) throw unsupported;
        const { view, stride, offset, boolean } = leaf;
        code.push(op.localGet, ...unsigned(handleLocal(handle, "found")), op.if, f64Type);
        labels.push("if");
        // The column's address from the record, then the row's element.
        code.push(op.localGet, ...unsigned(handleLocal(handle, "record")), op.i32Load, 2, ...unsigned(4 * (1 + read)));
        code.push(op.localGet, ...unsigned(handleLocal(handle, "row")), op.i32Const, ...signed(stride), op.i32Mul, op.i32Add);
        const memory = (align: number): number[] => [align, ...unsigned(offset)];
        if (boolean) code.push(view === "u8" ? op.i32Load8u : op.i32Load, ...memory(view === "u8" ? 0 : 2), op.i32Const, 0, op.i32Ne, op.f64ConvertI32U);
        else if (view === "f32") code.push(op.f32Load, ...memory(2), op.f64PromoteF32);
        else if (view === "i32") code.push(op.i32Load, ...memory(2), op.f64ConvertI32S);
        else if (view === "u32") code.push(op.i32Load, ...memory(2), op.f64ConvertI32U);
        else if (view === "u8") code.push(op.i32Load8u, ...memory(0), op.f64ConvertI32U);
        else code.push(op.f64Load, ...memory(3));
        code.push(op.else, op.f64Const, ...float64(NaN), op.end);
        labels.pop();
    };

    /** Sets the chunk tick of the row `rowOffset` rows past the current one, unless every row's chunk is stamped up front. */
    const stampChunk = (chunks: number, rowOffset: number): void => {
        if (everyRow.has(chunks)) return;
        code.push(op.localGet, ...unsigned(columnParameter(chunks)), op.localGet, ...unsigned(rowLocal));
        if (rowOffset !== 0) code.push(op.i32Const, ...signed(rowOffset), op.i32Add);
        code.push(op.i32Const, ...signed(chunkShift), op.i32ShrU, op.i32Const, 3, op.i32Shl, op.i32Add, op.localGet, 2, op.f64Store, 3, 0);
    };

    const statement = (current: Statement): void => {
        switch (current.kind) {
            case "set": emit(current.value); code.push(op.localSet, ...unsigned(local(current.local))); return;
            case "store": return store(current.column, current.value);
            case "stamp":
                if (columns[current.column].muted === true) return;
                store(current.column, "tick");
                return stampChunk(current.chunks, 0);
            case "if":
                emit(current.test);
                emitTruthy(typeOf(current.test));
                code.push(op.if, 0x40);
                labels.push("if");
                for (const inner of current.consequent) statement(inner);
                if (current.alternate.length > 0) {
                    code.push(op.else);
                    for (const inner of current.alternate) statement(inner);
                }
                labels.pop();
                code.push(op.end);
                return;
            case "block": case "loop":
                code.push(current.kind === "block" ? op.block : op.loop, 0x40);
                labels.push("program");
                for (const inner of current.body) statement(inner);
                labels.pop();
                code.push(op.end);
                return;
            case "branch": code.push(op.br, ...unsigned(wasmDepth(current.depth))); return;
            case "branchIf":
                emit(current.test);
                emitTruthy(typeOf(current.test));
                code.push(op.brIf, ...unsigned(wasmDepth(current.depth)));
                return;
            case "next": code.push(op.br, ...unsigned(labels.length - 1 - labels.lastIndexOf("next"))); return;
            case "find": return emitFind(current.handle, current.lookup, current.entity);
        }
    };

    // ---- SIMD. Lanes compute in f32, at storage precision, so results may differ from the scalar path in the last bit. ----

    const v128Type = 0x7b;
    const simd = (operation: number): number[] => [0xfd, ...unsigned(operation)];
    const vop = {
        load: 0, store: 11, const: 12, f32Splat: 19, f64Splat: 20,
        f32Eq: 65, f32Ne: 66, f32Lt: 67, f32Gt: 68, f32Le: 69, f32Ge: 70,
        not: 77, and: 78, andNot: 79, bitselect: 82,
        store32Lane: 90, store64Lane: 91, load32Zero: 92, load64Zero: 93,
        f32Ceil: 103, f32Floor: 104, f32Trunc: 105, i64ExtendLowS: 199, i64ExtendHighS: 200,
        f32Abs: 224, f32Neg: 225, f32Sqrt: 227, f32Add: 228, f32Sub: 229, f32Mul: 230, f32Div: 231, f32Min: 232, f32Max: 233,
    } as const;
    const float32 = (value: number): number[] => [...new Uint8Array(new Float32Array([value]).buffer)];
    const vectorConstant = (values: readonly number[]): number[] => [...simd(vop.const), ...[0, 1, 2, 3].flatMap(lane => float32(values[lane] ?? 0))];
    const splatConstant = (value: number): number[] => vectorConstant([value, value, value, value]);
    const arithmeticVector = { "+": vop.f32Add, "-": vop.f32Sub, "*": vop.f32Mul, "/": vop.f32Div } as const;
    const unaryVector: { readonly [name: string]: number | undefined } = { abs: vop.f32Abs, sqrt: vop.f32Sqrt, floor: vop.f32Floor, ceil: vop.f32Ceil, trunc: vop.f32Trunc };

    const isArithmetic = (operator: string): operator is keyof typeof arithmeticVector => operator in arithmeticVector;
    /** A value that's the same for every lane, splatted: demoted to f32, as a lane computes. */
    const emitSplat = (expression: Expression): void => {
        emit(expression);
        code.push(op.f32DemoteF64, ...simd(vop.f32Splat));
    };
    /** `Math` functions with an f32x4 equivalent; `fround` is the identity in f32. */
    const emitVectorMath = (functionName: string, count: number): void => {
        if (functionName === "min" || functionName === "max") {
            for (let i = 1; i < count; i++) code.push(...simd(functionName === "min" ? vop.f32Min : vop.f32Max));
            return;
        }
        const unary = unaryVector[functionName];
        if (unary !== undefined) code.push(...simd(unary));
    };
    const vectorMath = (functionName: string, count: number): boolean =>
        ((functionName === "min" || functionName === "max") && count > 0) || ((unaryVector[functionName] !== undefined || functionName === "fround") && count === 1);

    // ---- Across rows: four rows at a time, for straight-line programs whose columns are all dense f32. ----

    /** The mask of the enclosing `if`s, or null outside any. */
    let mask: number | null = null;
    const rowsLocals: number[] = [];
    const rowsLocal = (index: number): number => rowsLocals[index] ??= scratch(v128Type);

    const denseAddress = (column: number): void => {
        const { view, stride, boolean, component } = columns[column];
        if (view !== "f32" || stride !== 4 || boolean || component < 0) throw notVectorizable;
        code.push(op.localGet, ...unsigned(columnParameter(column)), op.localGet, ...unsigned(rowLocal), op.i32Const, 4, op.i32Mul, op.i32Add);
    };

    const vectorTruthy = (type: Type): void => {
        if (type === "boolean") {
            code.push(...splatConstant(0), ...simd(vop.f32Ne));
            return;
        }
        const value = scratch(v128Type);
        code.push(op.localTee, ...unsigned(value), ...splatConstant(0), ...simd(vop.f32Ne));
        code.push(op.localGet, ...unsigned(value), op.localGet, ...unsigned(value), ...simd(vop.f32Eq), ...simd(vop.and));
    };
    /** A lane mask as a value: 1 where set, 0 elsewhere. */
    const maskValue = (): void => {
        code.push(...splatConstant(1), ...simd(vop.and));
    };

    const rowsEmit = (expression: Expression): void => {
        switch (expression.kind) {
            case "number": code.push(...splatConstant(expression.value)); return;
            case "boolean": code.push(...splatConstant(expression.value ? 1 : 0)); return;
            case "local": code.push(op.localGet, ...unsigned(rowsLocal(expression.local))); return;
            case "resource": case "args": return emitSplat(expression);
            case "column":
                denseAddress(expression.column);
                code.push(...simd(vop.load), 2, ...unsigned(columns[expression.column].offset));
                return;
            case "unary":
                rowsEmit(expression.operand);
                if (expression.operator === "-") code.push(...simd(vop.f32Neg));
                else if (expression.operator === "!") {
                    vectorTruthy(typeOf(expression.operand));
                    code.push(...simd(vop.not));
                    maskValue();
                }
                else if (expression.operator === "~") throw notVectorizable;
                return;
            case "binary": {
                const { operator, left, right } = expression;
                if (operator === "===" || operator === "!==") {
                    const leftType = typeOf(left);
                    const rightType = typeOf(right);
                    if (leftType === "mixed" || rightType === "mixed") throw unsupported;
                    if (leftType !== rightType) {
                        code.push(...splatConstant(operator === "===" ? 0 : 1));
                        return;
                    }
                }
                const comparison = { "<": vop.f32Lt, ">": vop.f32Gt, "<=": vop.f32Le, ">=": vop.f32Ge, "==": vop.f32Eq, "!=": vop.f32Ne, "===": vop.f32Eq, "!==": vop.f32Ne }[operator as string];
                if (!isArithmetic(operator) && comparison === undefined) throw notVectorizable;
                rowsEmit(left);
                rowsEmit(right);
                if (isArithmetic(operator)) code.push(...simd(arithmeticVector[operator]));
                else if (comparison !== undefined) {
                    code.push(...simd(comparison));
                    maskValue();
                }
                return;
            }
            case "logical": {
                const value = scratch(v128Type);
                rowsEmit(expression.left);
                code.push(op.localSet, ...unsigned(value));
                // bitselect(a, b, m) takes a where m is set.
                if (expression.operator === "&&") {
                    rowsEmit(expression.right);
                    code.push(op.localGet, ...unsigned(value));
                }
                else {
                    code.push(op.localGet, ...unsigned(value));
                    rowsEmit(expression.right);
                }
                code.push(op.localGet, ...unsigned(value));
                vectorTruthy(typeOf(expression.left));
                code.push(...simd(vop.bitselect));
                return;
            }
            case "conditional":
                rowsEmit(expression.consequent);
                rowsEmit(expression.alternate);
                rowsEmit(expression.test);
                vectorTruthy(typeOf(expression.test));
                code.push(...simd(vop.bitselect));
                return;
            case "math":
                if (!vectorMath(expression.name, expression.arguments.length)) throw notVectorizable;
                for (const parameter of expression.arguments) rowsEmit(parameter);
                emitVectorMath(expression.name, expression.arguments.length);
                return;
            case "found": case "lookupLeaf": case "upFound": case "upLeaf": throw notVectorizable;
        }
    };

    /** Under a mask, keeps the old value (left on the stack below the new one) where the mask is clear. */
    const blend = (): void => {
        if (mask === null) return;
        code.push(op.localGet, ...unsigned(mask), ...simd(vop.bitselect));
    };

    const rowsStatement = (current: Statement): void => {
        switch (current.kind) {
            case "set": {
                const target = rowsLocal(current.local);
                rowsEmit(current.value);
                if (mask !== null) {
                    code.push(op.localGet, ...unsigned(target));
                    blend();
                }
                code.push(op.localSet, ...unsigned(target));
                return;
            }
            case "store": {
                const value = scratch(v128Type);
                rowsEmit(current.value);
                if (mask !== null) {
                    rowsEmit({ kind: "column", column: current.column });
                    blend();
                }
                code.push(op.localSet, ...unsigned(value));
                denseAddress(current.column);
                code.push(op.localGet, ...unsigned(value), ...simd(vop.store), 2, ...unsigned(columns[current.column].offset));
                return;
            }
            case "stamp": {
                if (columns[current.column].muted === true) return;
                // Ticks are dense f64: four rows are two f64x2 stores.
                for (let half = 0; half < 2; half++) {
                    const address = (): void => { code.push(op.localGet, ...unsigned(columnParameter(current.column)), op.localGet, ...unsigned(rowLocal), op.i32Const, 3, op.i32Shl, op.i32Add); };
                    address();
                    code.push(op.localGet, 2, ...simd(vop.f64Splat));
                    if (mask !== null) {
                        address();
                        code.push(...simd(vop.load), 3, ...unsigned(16 * half));
                        code.push(op.localGet, ...unsigned(mask), ...simd(half === 0 ? vop.i64ExtendLowS : vop.i64ExtendHighS), ...simd(vop.bitselect));
                    }
                    code.push(...simd(vop.store), 3, ...unsigned(16 * half));
                }
                // The group may straddle two chunks. Under a mask this can stamp a chunk no lane changed, which only costs a scan.
                stampChunk(current.chunks, 0);
                stampChunk(current.chunks, 3);
                return;
            }
            case "if": {
                const test = scratch(v128Type);
                rowsEmit(current.test);
                vectorTruthy(typeOf(current.test));
                code.push(op.localSet, ...unsigned(test));
                const outer = mask;
                const branch = (statements: readonly Statement[], negate: boolean): void => {
                    if (statements.length === 0) return;
                    const inner = scratch(v128Type);
                    if (outer === null) {
                        code.push(op.localGet, ...unsigned(test));
                        if (negate) code.push(...simd(vop.not));
                    }
                    else {
                        code.push(op.localGet, ...unsigned(outer), op.localGet, ...unsigned(test), ...simd(negate ? vop.andNot : vop.and));
                    }
                    code.push(op.localSet, ...unsigned(inner));
                    mask = inner;
                    for (const statement of statements) rowsStatement(statement);
                    mask = outer;
                };
                branch(current.consequent, false);
                branch(current.alternate, true);
                return;
            }
            default: throw notVectorizable;
        }
    };

    /** Rows from `start` in groups of four, up to the last whole group; leaves the row local at the first row not done. */
    const rowsLoop = (): void => {
        const vectorEnd = scratch(i32Type);
        code.push(op.localGet, 1, op.localGet, 0, op.i32Sub, op.i32Const, ...signed(-4), op.i32And, op.localGet, 0, op.i32Add, op.localSet, ...unsigned(vectorEnd));
        code.push(op.block, 0x40, op.loop, 0x40);
        code.push(op.localGet, ...unsigned(rowLocal), op.localGet, ...unsigned(vectorEnd), op.i32GeS, op.brIf, 1);
        mask = null;
        for (const current of program.body) rowsStatement(current);
        code.push(op.localGet, ...unsigned(rowLocal), op.i32Const, 4, op.i32Add, op.localSet, ...unsigned(rowLocal), op.br, 0);
        code.push(op.end, op.end);
    };

    // ---- Within a row (SLP): statements over a component's leaves that match lane for lane become one f32x4 operation. ----

    type Window = { readonly component: number; readonly base: number; readonly lanes: number };
    type VectorExpression =
        | { readonly kind: "pack"; readonly pack: Pack }
        | { readonly kind: "load"; readonly column: number; readonly window: Window }
        | { readonly kind: "constant"; readonly values: readonly number[] }
        | { readonly kind: "splat"; readonly expression: Expression }
        | { readonly kind: "binary"; readonly operator: keyof typeof arithmeticVector; readonly left: VectorExpression; readonly right: VectorExpression }
        | { readonly kind: "negate"; readonly operand: VectorExpression }
        | { readonly kind: "math"; readonly name: string; readonly arguments: readonly VectorExpression[] };
    /** Snapshot locals that hold a component's leaves, loaded as one vector at the first of their `set`s. */
    type Pack = { readonly first: number; readonly column: number; readonly window: Window; readonly lanes: Map<number, number>; used: boolean; local: number };
    type Group = { readonly length: number; readonly column: number; readonly window: Window; readonly value: VectorExpression };

    /** f32 leaves of one component, as consecutive lanes from the lowest offset; null if they can't be. */
    const windowOf = (laneColumns: readonly number[]): Window | null => {
        const infos = laneColumns.map(column => columns[column]);
        const first = infos[0];
        if (first === undefined || infos.some(info => info.view !== "f32" || info.boolean || info.component !== first.component || info.component < 0)) return null;
        const base = Math.min(...infos.map(info => info.offset));
        const lanes = infos.map(info => (info.offset - base) / 4);
        if (lanes.some(lane => lane > 3) || new Set(lanes).size !== lanes.length) return null;
        return { component: first.component, base, lanes: Math.max(...lanes) + 1 };
    };
    const laneIn = (window: Window, column: number): number => (columns[column].offset - window.base) / 4;

    const elementAddress = (column: number): void => {
        code.push(op.localGet, ...unsigned(columnParameter(column)), op.localGet, ...unsigned(rowLocal), op.i32Const, ...signed(columns[column].stride), op.i32Mul, op.i32Add);
    };
    /**
     * Loads a window's lanes. Three or four lanes load 16 bytes, which can read up to 12 past the element:
     * columns keep `columnSlack` bytes after their last row for that. Two or one load only their lanes.
     */
    const loadWindow = (column: number, { base, lanes }: Window): void => {
        elementAddress(column);
        if (lanes >= 3) return void code.push(...simd(vop.load), 2, ...unsigned(base));
        code.push(...simd(lanes === 1 ? vop.load32Zero : vop.load64Zero), 2, ...unsigned(base));
    };
    /** Stores a window's lanes from a v128 local, without touching the rest of the element. */
    const storeWindow = (column: number, { base, lanes }: Window, value: number): void => {
        elementAddress(column);
        code.push(op.localGet, ...unsigned(value));
        if (lanes === 4) return void code.push(...simd(vop.store), 2, ...unsigned(base));
        code.push(...simd(vop.store64Lane), 2, ...unsigned(base), 0);
        if (lanes !== 3) return;
        elementAddress(column);
        code.push(op.localGet, ...unsigned(value), ...simd(vop.store32Lane), 2, ...unsigned(base + 8), 2);
    };

    /** Plans the fusion of top-level statements. Statement index to group, and which `set`s only feed groups. */
    const planLanes = (): { readonly groups: ReadonlyMap<number, Group>; readonly packs: ReadonlyMap<number, Pack>; readonly skipped: ReadonlySet<number> } => {
        const body = program.body;
        const assignments = new Map<number, number>();
        const uses = new Map<number, number>();
        const countExpression = (expression: Expression): void => {
            switch (expression.kind) {
                case "local": uses.set(expression.local, (uses.get(expression.local) ?? 0) + 1); return;
                case "unary": return countExpression(expression.operand);
                case "binary": case "logical": countExpression(expression.left); return countExpression(expression.right);
                case "conditional": countExpression(expression.test); countExpression(expression.consequent); return countExpression(expression.alternate);
                case "math": for (const parameter of expression.arguments) countExpression(parameter); return;
                default: return;
            }
        };
        const countStatements = (statements: readonly Statement[]): void => {
            for (const statement of statements) {
                switch (statement.kind) {
                    case "set": assignments.set(statement.local, (assignments.get(statement.local) ?? 0) + 1); countExpression(statement.value); break;
                    case "store": countExpression(statement.value); break;
                    case "branchIf": countExpression(statement.test); break;
                    case "find": countExpression(statement.entity); break;
                    case "if": countExpression(statement.test); countStatements(statement.consequent); countStatements(statement.alternate); break;
                    case "block": case "loop": countStatements(statement.body); break;
                    default: break;
                }
            }
        };
        countStatements(body);

        // Packs: single-assignment snapshot locals of one component's leaves, with no store to it between their sets.
        const packOfLocal = new Map<number, Pack>();
        const open = new Map<number, { first: number; columns: number[]; locals: number[] }>();
        const packs = new Map<number, Pack>();
        const close = (component: number): void => {
            const pending = open.get(component);
            open.delete(component);
            if (pending === undefined || pending.columns.length < 2) return;
            const window = windowOf(pending.columns);
            if (window === null) return;
            const pack: Pack = { first: pending.first, column: pending.columns[0], window, lanes: new Map(), used: false, local: -1 };
            pending.locals.forEach((local, i) => {
                pack.lanes.set(local, laneIn(window, pending.columns[i]));
                packOfLocal.set(local, pack);
            });
            packs.set(pending.first, pack);
        };
        body.forEach((statement, index) => {
            if (statement.kind === "set" && statement.value.kind === "column" && assignments.get(statement.local) === 1) {
                const info = columns[statement.value.column];
                if (info.view === "f32" && !info.boolean && info.component >= 0) {
                    const pending = open.get(info.component) ?? { first: index, columns: [], locals: [] };
                    open.set(info.component, pending);
                    pending.columns.push(statement.value.column);
                    pending.locals.push(statement.local);
                    return;
                }
            }
            if (statement.kind === "store") close(columns[statement.column].component);
            if (statement.kind !== "set") for (const component of [...open.keys()]) close(component);
        });
        for (const component of [...open.keys()]) close(component);

        /** Whether an expression reads a leaf (by component and offset) in `written`. */
        const reads = (expression: Expression, written: ReadonlySet<string>): boolean => {
            switch (expression.kind) {
                case "column": return written.has(`${columns[expression.column].component}:${columns[expression.column].offset}`);
                case "unary": return reads(expression.operand, written);
                case "binary": case "logical": return reads(expression.left, written) || reads(expression.right, written);
                case "conditional": return reads(expression.test, written) || reads(expression.consequent, written) || reads(expression.alternate, written);
                case "math": return expression.arguments.some(parameter => reads(parameter, written));
                default: return false;
            }
        };
        /** Fused stores read everything before writing, so no store may read a leaf an earlier one in the group wrote. */
        const readsEarlierStore = (stores: readonly Extract<Statement, { kind: "store" }>[]): boolean => {
            const written = new Set<string>();
            for (const store of stores) {
                if (reads(store.value, written)) return true;
                written.add(`${columns[store.column].component}:${columns[store.column].offset}`);
            }
            return false;
        };
        const groupUses = new Map<number, number>();
        /** Matches one expression per lane; null if they don't line up. */
        const match = (lanes: readonly Expression[]): VectorExpression | null => {
            const first = lanes[0];
            if (lanes.every(lane => JSON.stringify(lane) === JSON.stringify(first))) return { kind: "splat", expression: first };
            if (lanes.every(lane => lane.kind === "number")) return { kind: "constant", values: lanes.map(lane => lane.kind === "number" ? lane.value : 0) };
            if (first.kind === "local") {
                const pack = packOfLocal.get(first.local);
                if (pack !== undefined && lanes.every((lane, i) => lane.kind === "local" && packOfLocal.get(lane.local) === pack && pack.lanes.get(lane.local) === i)) {
                    for (const lane of lanes) if (lane.kind === "local") groupUses.set(lane.local, (groupUses.get(lane.local) ?? 0) + 1);
                    return { kind: "pack", pack };
                }
                return null;
            }
            if (first.kind === "column") {
                const laneColumns = lanes.flatMap(lane => lane.kind === "column" ? [lane.column] : []);
                const window = laneColumns.length === lanes.length ? windowOf(laneColumns) : null;
                return window !== null && laneColumns.every((column, i) => laneIn(window, column) === i) ? { kind: "load", column: laneColumns[0], window } : null;
            }
            if (first.kind === "binary" && isArithmetic(first.operator)) {
                const { operator } = first;
                const pairs = lanes.flatMap(lane => lane.kind === "binary" && lane.operator === operator ? [lane] : []);
                if (pairs.length !== lanes.length) return null;
                const left = match(pairs.map(pair => pair.left));
                const right = left === null ? null : match(pairs.map(pair => pair.right));
                return left === null || right === null ? null : { kind: "binary", operator, left, right };
            }
            if (first.kind === "unary" && (first.operator === "-" || first.operator === "+")) {
                const operator = first.operator;
                const operands = lanes.flatMap(lane => lane.kind === "unary" && lane.operator === operator ? [lane.operand] : []);
                if (operands.length !== lanes.length) return null;
                const operand = match(operands);
                return operand === null ? null : operator === "-" ? { kind: "negate", operand } : operand;
            }
            if (first.kind === "math" && vectorMath(first.name, first.arguments.length)) {
                const calls = lanes.flatMap(lane => lane.kind === "math" && lane.name === first.name && lane.arguments.length === first.arguments.length ? [lane] : []);
                if (calls.length !== lanes.length) return null;
                const parameters: VectorExpression[] = [];
                for (let i = 0; i < first.arguments.length; i++) {
                    const parameter = match(calls.map(call => call.arguments[i]));
                    if (parameter === null) return null;
                    parameters.push(parameter);
                }
                return { kind: "math", name: first.name, arguments: parameters };
            }
            return null;
        };

        // Groups: consecutive stores to two or more leaves of one component whose values match lane for lane.
        const groups = new Map<number, Group>();
        for (let index = 0; index < body.length;) {
            const statement = body[index];
            if (statement.kind !== "store") {
                index++;
                continue;
            }
            const component = columns[statement.column].component;
            let end = index;
            while (end < body.length) {
                const next = body[end];
                if (next.kind !== "store" || columns[next.column].component !== component) break;
                end++;
            }
            const stores = body.slice(index, end).flatMap(store => store.kind === "store" ? [store] : []);
            const window = stores.length >= 2 ? windowOf(stores.map(store => store.column)) : null;
            const lanes: Expression[] = [];
            if (window !== null && window.lanes === stores.length) for (const store of stores) lanes[laneIn(window, store.column)] = store.value;
            const before = new Map(groupUses);
            const value = window !== null && window.lanes === stores.length && !readsEarlierStore(stores) ? match(lanes) : null;
            if (window !== null && value !== null) {
                groups.set(index, { length: stores.length, column: stores[0].column, window, value });
                const markUsed = (expression: VectorExpression): void => {
                    if (expression.kind === "pack") expression.pack.used = true;
                    else if (expression.kind === "binary") { markUsed(expression.left); markUsed(expression.right); }
                    else if (expression.kind === "negate") markUsed(expression.operand);
                    else if (expression.kind === "math") expression.arguments.forEach(markUsed);
                };
                markUsed(value);
            }
            else {
                groupUses.clear();
                for (const [local, count] of before) groupUses.set(local, count);
            }
            index = end;
        }

        // A snapshot `set` whose local is only read through vectors needn't run as a scalar.
        const skipped = new Set<number>();
        body.forEach((statement, index) => {
            if (statement.kind === "set" && packOfLocal.get(statement.local)?.used === true && (uses.get(statement.local) ?? 0) === (groupUses.get(statement.local) ?? 0)) skipped.add(index);
        });
        return { groups, packs, skipped };
    };

    const emitVectorExpression = (expression: VectorExpression): void => {
        switch (expression.kind) {
            case "pack": code.push(op.localGet, ...unsigned(expression.pack.local)); return;
            case "load": return loadWindow(expression.column, expression.window);
            case "constant": code.push(...vectorConstant(expression.values)); return;
            case "splat": return emitSplat(expression.expression);
            case "binary":
                emitVectorExpression(expression.left);
                emitVectorExpression(expression.right);
                code.push(...simd(arithmeticVector[expression.operator]));
                return;
            case "negate":
                emitVectorExpression(expression.operand);
                code.push(...simd(vop.f32Neg));
                return;
            case "math":
                for (const parameter of expression.arguments) emitVectorExpression(parameter);
                emitVectorMath(expression.name, expression.arguments.length);
                return;
        }
    };

    /** The row body, with planned groups fused; returns whether anything was. */
    const emitLaneBody = (): boolean => {
        const { groups, packs, skipped } = planLanes();
        const body = program.body;
        for (let index = 0; index < body.length; index++) {
            const pack = packs.get(index);
            if (pack?.used === true) {
                pack.local = scratch(v128Type);
                loadWindow(pack.column, pack.window);
                code.push(op.localSet, ...unsigned(pack.local));
            }
            const group = groups.get(index);
            if (group !== undefined) {
                const value = scratch(v128Type);
                emitVectorExpression(group.value);
                code.push(op.localSet, ...unsigned(value));
                storeWindow(group.column, group.window, value);
                index += group.length - 1;
                continue;
            }
            if (!skipped.has(index)) statement(body[index]);
        }
        return groups.size > 0;
    };

    // ---- Across rows for interleaved elements: four rows of a `stride`-byte element are `stride / 4` whole vectors. ----

    type LanePlan = ReturnType<typeof planLanes>;
    /** Whether a value is the same for every row. */
    const rowIndependent = (expression: Expression): boolean => {
        switch (expression.kind) {
            case "number": case "boolean": case "resource": case "args": return true;
            case "unary": return rowIndependent(expression.operand);
            case "binary": case "logical": return rowIndependent(expression.left) && rowIndependent(expression.right);
            case "conditional": return rowIndependent(expression.test) && rowIndependent(expression.consequent) && rowIndependent(expression.alternate);
            case "math": return expression.arguments.every(rowIndependent);
            default: return false;
        }
    };
    /**
     * Whether the planned groups are the whole body and run unchanged on flat vectors of four rows: each group stores
     * whole elements and reads windows from byte 0 of components with the same stride, so lane `l` of vector `j` is the
     * same leaf in every operand. Snapshot sets must be skipped, and stamps run as in the across-rows loop.
     */
    const acrossElements = ({ groups, skipped }: LanePlan): boolean => {
        if (filters > 0 || groups.size === 0) return false;
        const whole = (column: number, window: Window, stride: number): boolean => window.base === 0 && columns[column].stride === stride;
        const fits = (expression: VectorExpression, stride: number): boolean => {
            switch (expression.kind) {
                case "pack": return whole(expression.pack.column, expression.pack.window, stride);
                case "load": return whole(expression.column, expression.window, stride);
                case "constant": return true;
                case "splat": return rowIndependent(expression.expression);
                case "binary": return fits(expression.left, stride) && fits(expression.right, stride);
                case "negate": return fits(expression.operand, stride);
                case "math": return expression.arguments.every(parameter => fits(parameter, stride));
            }
        };
        const body = program.body;
        for (let index = 0; index < body.length; index++) {
            const group = groups.get(index);
            if (group !== undefined) {
                const { stride } = columns[group.column];
                if (group.window.base !== 0 || group.window.lanes * 4 !== stride || !fits(group.value, stride)) return false;
                index += group.length - 1;
            }
            else if (!skipped.has(index) && body[index].kind !== "stamp") return false;
        }
        return true;
    };

    /** Vector `vector` of an expression over four rows of `stride`-byte elements; packs are in `packVectors`. */
    const emitElementExpression = (expression: VectorExpression, vector: number, stride: number, packVectors: ReadonlyMap<Pack, readonly number[]>): void => {
        switch (expression.kind) {
            case "pack": {
                // Every pack a group uses is loaded at its first set, before the group.
                const local = packVectors.get(expression.pack)?.[vector];
                if (local === undefined) throw new Error("A pack is used before it's loaded.");
                code.push(op.localGet, ...unsigned(local));
                return;
            }
            case "load":
                elementAddress(expression.column);
                code.push(...simd(vop.load), 2, ...unsigned(16 * vector));
                return;
            case "constant": code.push(...vectorConstant([0, 1, 2, 3].map(lane => expression.values[((16 * vector + 4 * lane) % stride) / 4]))); return;
            case "splat": return emitSplat(expression.expression);
            case "binary":
                emitElementExpression(expression.left, vector, stride, packVectors);
                emitElementExpression(expression.right, vector, stride, packVectors);
                code.push(...simd(arithmeticVector[expression.operator]));
                return;
            case "negate":
                emitElementExpression(expression.operand, vector, stride, packVectors);
                code.push(...simd(vop.f32Neg));
                return;
            case "math":
                for (const parameter of expression.arguments) emitElementExpression(parameter, vector, stride, packVectors);
                emitVectorMath(expression.name, expression.arguments.length);
                return;
        }
    };

    /**
     * Rows from `start` in groups of four, up to the last whole group, with every group as `stride / 4` full-vector loads,
     * operations and stores; leaves the row local at the first row not done. Vectors stay inside the four rows' elements,
     * and each vector's store only touches bytes no other vector reads.
     */
    const elementsLoop = ({ groups, packs }: LanePlan): void => {
        const vectorEnd = scratch(i32Type);
        code.push(op.localGet, 1, op.localGet, 0, op.i32Sub, op.i32Const, ...signed(-4), op.i32And, op.localGet, 0, op.i32Add, op.localSet, ...unsigned(vectorEnd));
        code.push(op.block, 0x40, op.loop, 0x40);
        code.push(op.localGet, ...unsigned(rowLocal), op.localGet, ...unsigned(vectorEnd), op.i32GeS, op.brIf, 1);
        mask = null;
        const packVectors = new Map<Pack, number[]>();
        const body = program.body;
        for (let index = 0; index < body.length; index++) {
            const pack = packs.get(index);
            if (pack?.used === true) {
                const vectors = Array.from({ length: columns[pack.column].stride / 4 }, (_, vector) => {
                    const local = scratch(v128Type);
                    elementAddress(pack.column);
                    code.push(...simd(vop.load), 2, ...unsigned(16 * vector), op.localSet, ...unsigned(local));
                    return local;
                });
                packVectors.set(pack, vectors);
            }
            const group = groups.get(index);
            if (group !== undefined) {
                const { stride } = columns[group.column];
                for (let vector = 0; vector < stride / 4; vector++) {
                    const value = scratch(v128Type);
                    emitElementExpression(group.value, vector, stride, packVectors);
                    code.push(op.localSet, ...unsigned(value));
                    elementAddress(group.column);
                    code.push(op.localGet, ...unsigned(value), ...simd(vop.store), 2, ...unsigned(16 * vector));
                }
                index += group.length - 1;
            }
            else if (body[index].kind === "stamp") rowsStatement(body[index]);
        }
        code.push(op.localGet, ...unsigned(rowLocal), op.i32Const, 4, op.i32Add, op.localSet, ...unsigned(rowLocal), op.br, 0);
        code.push(op.end, op.end);
    };

    try {
        const parameterCount = 4 + columns.length + 2 * filters + lookupParameters + upParameters;
        collectFinds(program.body);
        /** Leaves 1 if any filter's tick at `(row >> shift) * 8` in its `parameter` array is newer than `lastRun`. */
        const anyNewer = (parameter: (filter: number) => number, shift: number): void => {
            for (let filter = 0; filter < filters; filter++) {
                code.push(op.localGet, ...unsigned(parameter(filter)), op.localGet, ...unsigned(rowLocal));
                if (shift > 0) code.push(op.i32Const, ...signed(shift), op.i32ShrU);
                code.push(op.i32Const, 3, op.i32Shl, op.i32Add, op.f64Load, 3, 0, op.localGet, 3, op.f64Gt);
                if (filter > 0) code.push(op.i32Or);
            }
        };
        /** At a chunk's first row, skips the whole chunk unless a filter's chunk tick is newer. */
        const skipChunks = (): void => {
            const next = scratch(i32Type);
            code.push(op.localGet, ...unsigned(rowLocal), op.localGet, 0, op.i32Eq, op.localGet, ...unsigned(rowLocal), op.i32Const, ...signed(2 ** chunkShift - 1), op.i32And, op.i32Eqz, op.i32Or);
            code.push(op.if, 0x40);
            anyNewer(filterChunkParameter, chunkShift);
            code.push(op.i32Eqz, op.if, 0x40);
            // row = min(end, start of the next chunk)
            code.push(op.localGet, ...unsigned(rowLocal), op.i32Const, ...signed(chunkShift), op.i32ShrU, op.i32Const, 1, op.i32Add, op.i32Const, ...signed(chunkShift), op.i32Shl, op.localSet, ...unsigned(next));
            code.push(op.localGet, ...unsigned(next), op.localGet, 1, op.localGet, ...unsigned(next), op.localGet, 1, op.i32LtS, op.select, op.localSet, ...unsigned(rowLocal));
            code.push(op.br, 2, op.end, op.end);
        };
        // Scalars are discovered while generating, so code is generated first with locals placed after a provisional scalar count.
        /** `rows`: four rows at a time where every column is dense; `lanes`: fuse statements within each row. */
        let fused = false;
        const generate = (scalarCount: number, mode: "rows" | "lanes" | "scalar"): void => {
            code.length = 0;
            extraLocals.length = 0;
            rowsLocals.length = 0;
            // With reductions, the partials' address follows the scalars.
            const partialsParameter = parameterCount + scalarCount;
            localBase = partialsParameter + (accumulators.length > 0 ? 1 : 0);
            rowLocal = scratch(i32Type);
            code.push(op.localGet, 0, op.localSet, ...unsigned(rowLocal));
            accumulators.forEach((accumulator, k) => {
                code.push(op.localGet, ...unsigned(partialsParameter), op.f64Load, 3, ...unsigned(8 * k), op.localSet, ...unsigned(local(accumulator)));
            });
            handleLocals.clear();
            if (lookupParameters > 0) convertLookupParameters();
            stampRangeChunks();
            if (mode === "rows") rowsLoop();
            if (mode === "lanes") {
                const plan = planLanes();
                if (acrossElements(plan)) elementsLoop(plan);
            }
            // for (; row < end; row++) { block next { body } }, where with `up` the row and its parent's are rows[n] and parents[n].
            const slot = rowLocal;
            if (upMode) {
                rowLocal = scratch(i32Type);
                parentLocal = scratch(i32Type);
            }
            code.push(op.block, 0x40, op.loop, 0x40);
            code.push(op.localGet, ...unsigned(slot), op.localGet, 1, op.i32GeS, op.brIf, 1);
            if (upMode) {
                code.push(op.localGet, ...unsigned(upParameter(0)), op.localGet, ...unsigned(slot), op.i32Const, 2, op.i32Shl, op.i32Add, op.i32Load, 2, 0, op.localSet, ...unsigned(rowLocal));
                code.push(op.localGet, ...unsigned(upParameter(1)), op.localGet, ...unsigned(slot), op.i32Const, 2, op.i32Shl, op.i32Add, op.i32Load, 2, 0, op.localSet, ...unsigned(parentLocal));
            }
            if (filters > 0) skipChunks();
            code.push(op.block, 0x40);
            // A row that no filter passes goes to the next.
            if (filters > 0) {
                anyNewer(filterRowParameter, 0);
                code.push(op.i32Eqz, op.brIf, 0);
            }
            labels.length = 0;
            labels.push("next");
            if (mode === "lanes") fused = emitLaneBody();
            else for (const current of program.body) statement(current);
            labels.pop();
            code.push(op.end);
            code.push(op.localGet, ...unsigned(slot), op.i32Const, 1, op.i32Add, op.localSet, ...unsigned(slot), op.br, 0);
            code.push(op.end, op.end);
            rowLocal = slot;
            accumulators.forEach((accumulator, k) => {
                code.push(op.localGet, ...unsigned(partialsParameter), op.localGet, ...unsigned(local(accumulator)), op.f64Store, 3, ...unsigned(8 * k));
            });
            // The function's end.
            code.push(op.end);
        };
        // Across-rows mode doesn't filter rows, so filtered kernels fuse within rows instead.
        // Accumulators carry from row to row, which neither SIMD mode keeps.
        // Listed rows aren't consecutive, so `up` programs run one row at a time.
        let mode: "rows" | "lanes" | "scalar" = !simdEnabled || accumulators.length > 0 || upMode ? "scalar" : filters > 0 ? "lanes" : "rows";
        try {
            generate(0, mode);
        }
        catch (error) {
            if (error !== notVectorizable) throw error;
            mode = "lanes";
            generate(0, mode);
        }
        if (mode === "lanes" && !fused) {
            mode = "scalar";
            generate(0, mode);
        }
        const discovered = scalars.length;
        generate(discovered, mode);
        if (scalars.length !== discovered) throw unsupported;
        const vectorized = mode !== "scalar";

        const parameterTypes = [i32Type, i32Type, f64Type, f64Type, ...columns.map(() => i32Type), ...new Array<number>(2 * filters).fill(i32Type), ...new Array<number>(lookupParameters).fill(f64Type), ...new Array<number>(upParameters).fill(i32Type), ...scalars.map(() => f64Type), ...accumulators.length > 0 ? [i32Type] : []];
        const localTypesList = [...new Array<number>(program.locals).fill(f64Type)];
        // Locals in order: program locals, then extras in creation order; the row index was the first extra.
        const declared = [...localTypesList.map(type => [1, type]), ...extraLocals.map(type => [1, type])];
        const body = [...vector(declared.map(([count, type]) => [...unsigned(count), type])), ...code];
        const types = [
            [0x60, ...vector(parameterTypes.map(type => [type])), ...vector([])],
            [0x60, ...vector([[f64Type], [f64Type]]), ...vector([[f64Type]])],
        ];
        const importEntries = [
            [...name("env"), ...name("memory"), 0x02, 0x03, ...unsigned(1), ...unsigned(65536)],
            ...imports.map(functionName => [...name("math"), ...name(functionName), 0x00, ...unsigned(1)]),
        ];
        const bytes = new Uint8Array([
            0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
            ...section(1, vector(types)),
            ...section(2, vector(importEntries)),
            ...section(3, vector([unsigned(0)])),
            ...section(7, vector([[...name("run"), 0x00, ...unsigned(imports.length)]])),
            ...section(10, vector([[...unsigned(body.length), ...body]])),
        ]);
        return { bytes, scalars, imports, vectorized };
    }
    catch (error) {
        if (error === unsupported) return null;
        throw error;
    }
};
