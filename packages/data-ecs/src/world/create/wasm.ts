import type { Program } from './kernel.js';
import type { View } from '../../layout/layout.js';

type Expression = Program.Expression;
type Statement = Program.Statement;

/** What a value is, for strict equality: JS `true === 1` is false, but both are 1 here. */
export type Type = "number" | "boolean" | "mixed";

/**
 * Where column `k`'s value for a row is: at its address plus `row * stride + offset` bytes, through `view`.
 * Entity and tick columns are dense f64. `boolean` columns read as 0 or 1.
 */
export type WasmColumn = { readonly view: View; readonly stride: number; readonly offset: number; readonly boolean: boolean };

/** A scalar parameter: a leaf of a resource or of `args`, in `scalars` order. */
export type WasmScalar = { readonly source: "resource"; readonly index: number; readonly path: readonly (number | string)[] } | { readonly source: "args"; readonly path: readonly (number | string)[] };

export type WasmKernel = {
    /** Compile asynchronously: browsers limit synchronous compiles on the main thread. */
    readonly bytes: Uint8Array;
    /** Which resource and args leaves the caller passes, after the column addresses. */
    readonly scalars: readonly WasmScalar[];
    /** The JS functions it imports, by name. */
    readonly imports: readonly string[];
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

/** The `run` export of an instantiated kernel module. */
export type WasmRun = (start: number, end: number, tick: number, ...values: number[]) => void;

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
    block: 0x02, loop: 0x03, if: 0x04, else: 0x05, end: 0x0b, br: 0x0c, brIf: 0x0d, call: 0x10, drop: 0x1a,
    localGet: 0x20, localSet: 0x21, localTee: 0x22,
    i32Load: 0x28, f32Load: 0x2a, f64Load: 0x2b, i32Load8u: 0x2d, i32Store: 0x36, f32Store: 0x38, f64Store: 0x39, i32Store8: 0x3a,
    i32Const: 0x41, f64Const: 0x44,
    i32Eqz: 0x45, i32GeS: 0x4e,
    f64Eq: 0x61, f64Ne: 0x62, f64Lt: 0x63, f64Gt: 0x64, f64Le: 0x65, f64Ge: 0x66,
    i32Clz: 0x67, i32Add: 0x6a, i32Mul: 0x6c, i32And: 0x71, i32Or: 0x72, i32Xor: 0x73, i32Shl: 0x74, i32ShrS: 0x75, i32ShrU: 0x76,
    f64Abs: 0x99, f64Neg: 0x9a, f64Ceil: 0x9b, f64Floor: 0x9c, f64Trunc: 0x9d, f64Sqrt: 0x9f,
    f64Add: 0xa0, f64Sub: 0xa1, f64Mul: 0xa2, f64Div: 0xa3, f64Min: 0xa4, f64Max: 0xa5,
    i32WrapI64: 0xa7, f32DemoteF64: 0xb6, f64ConvertI32S: 0xb7, f64ConvertI32U: 0xb8, f64PromoteF32: 0xbb,
} as const;
const f64Type = 0x7c;
const i32Type = 0x7f;
/** `i64.trunc_sat_f64_s`, a 0xfc-prefixed opcode. */
const i64TruncSatF64S = [0xfc, 0x06];

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

const join = (a: Type, b: Type): Type => a === b ? a : "mixed";

/**
 * Generates a WASM module for a kernel program, with JS semantics: every value is an f64, and stores
 * convert as typed arrays do. Returns `null` when exact equivalence can't be guaranteed.
 *
 * The exported `run(start, end, tick, ...columnAddresses, ...scalars)` processes rows `start` to `end`.
 */
export const generateWasm = (
    program: Program,
    columns: readonly WasmColumn[],
    scalarTypes: (scalar: WasmScalar) => Type | null,
): WasmKernel | null => {
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

    // Parameters: start, end, tick, then one address per column, then scalars. Locals follow.
    const columnParameter = (column: number): number => 3 + column;
    const scalarParameter = (index: number): number => 3 + columns.length + index;
    const code: number[] = [];
    const extraLocals: number[] = [];
    let localBase = 0;
    const local = (index: number): number => localBase + index;
    const scratch = (type: number): number => {
        extraLocals.push(type);
        return localBase + program.locals + extraLocals.length - 1;
    };
    let rowLocal = 0;
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
            case "column": {
                const { view, offset, boolean } = columns[expression.column];
                address(expression.column);
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

    const statement = (current: Statement): void => {
        switch (current.kind) {
            case "set": emit(current.value); code.push(op.localSet, ...unsigned(local(current.local))); return;
            case "store": return store(current.column, current.value);
            case "stamp": return store(current.column, "tick");
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
        }
    };

    try {
        const parameterCount = 3 + columns.length;
        // Scalars are discovered while generating, so code is generated first with locals placed after a provisional scalar count.
        const generate = (scalarCount: number): void => {
            code.length = 0;
            extraLocals.length = 0;
            localBase = parameterCount + scalarCount;
            rowLocal = scratch(i32Type);
            // for (row = start; row < end; row++) { block next { body } }
            code.push(op.localGet, 0, op.localSet, ...unsigned(rowLocal));
            code.push(op.block, 0x40, op.loop, 0x40);
            code.push(op.localGet, ...unsigned(rowLocal), op.localGet, 1, op.i32GeS, op.brIf, 1);
            code.push(op.block, 0x40);
            labels.length = 0;
            labels.push("next");
            for (const current of program.body) statement(current);
            labels.pop();
            code.push(op.end);
            code.push(op.localGet, ...unsigned(rowLocal), op.i32Const, 1, op.i32Add, op.localSet, ...unsigned(rowLocal), op.br, 0);
            code.push(op.end, op.end, op.end);
        };
        generate(0);
        const discovered = scalars.length;
        generate(discovered);
        if (scalars.length !== discovered) throw unsupported;

        const parameterTypes = [i32Type, i32Type, f64Type, ...columns.map(() => i32Type), ...scalars.map(() => f64Type)];
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
        return { bytes, scalars, imports };
    }
    catch (error) {
        if (error === unsupported) return null;
        throw error;
    }
};
