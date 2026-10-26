// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * WASM's text format for the modules the kernel generator emits (`world/wasm.ts`): types, imports, one function, its
 * export and a name section. Instructions are MVP's, the saturating truncations and SIMD's; anything else, or bytes
 * that don't parse, is a failure rather than text.
 */
export type Wat = { readonly wat: string } | { readonly failure: string };

const valueTypes: { readonly [type: number]: string } = { 0x7f: "i32", 0x7e: "i64", 0x7d: "f32", 0x7c: "f64", 0x7b: "v128" };

/** MVP's numeric instructions, 0x45 to 0xc4 in order. */
const numeric = (
    "i32.eqz i32.eq i32.ne i32.lt_s i32.lt_u i32.gt_s i32.gt_u i32.le_s i32.le_u i32.ge_s i32.ge_u "
    + "i64.eqz i64.eq i64.ne i64.lt_s i64.lt_u i64.gt_s i64.gt_u i64.le_s i64.le_u i64.ge_s i64.ge_u "
    + "f32.eq f32.ne f32.lt f32.gt f32.le f32.ge f64.eq f64.ne f64.lt f64.gt f64.le f64.ge "
    + "i32.clz i32.ctz i32.popcnt i32.add i32.sub i32.mul i32.div_s i32.div_u i32.rem_s i32.rem_u i32.and i32.or i32.xor i32.shl i32.shr_s i32.shr_u i32.rotl i32.rotr "
    + "i64.clz i64.ctz i64.popcnt i64.add i64.sub i64.mul i64.div_s i64.div_u i64.rem_s i64.rem_u i64.and i64.or i64.xor i64.shl i64.shr_s i64.shr_u i64.rotl i64.rotr "
    + "f32.abs f32.neg f32.ceil f32.floor f32.trunc f32.nearest f32.sqrt f32.add f32.sub f32.mul f32.div f32.min f32.max f32.copysign "
    + "f64.abs f64.neg f64.ceil f64.floor f64.trunc f64.nearest f64.sqrt f64.add f64.sub f64.mul f64.div f64.min f64.max f64.copysign "
    + "i32.wrap_i64 i32.trunc_f32_s i32.trunc_f32_u i32.trunc_f64_s i32.trunc_f64_u i64.extend_i32_s i64.extend_i32_u i64.trunc_f32_s i64.trunc_f32_u i64.trunc_f64_s i64.trunc_f64_u "
    + "f32.convert_i32_s f32.convert_i32_u f32.convert_i64_s f32.convert_i64_u f32.demote_f64 f64.convert_i32_s f64.convert_i32_u f64.convert_i64_s f64.convert_i64_u f64.promote_f32 "
    + "i32.reinterpret_f32 i64.reinterpret_f64 f32.reinterpret_i32 f64.reinterpret_i64"
).split(" ");

/** MVP's loads and stores, 0x28 to 0x3e in order, each with its natural alignment's log2. */
const memory = (
    "i32.load:2 i64.load:3 f32.load:2 f64.load:3 i32.load8_s:0 i32.load8_u:0 i32.load16_s:1 i32.load16_u:1 "
    + "i64.load8_s:0 i64.load8_u:0 i64.load16_s:1 i64.load16_u:1 i64.load32_s:2 i64.load32_u:2 "
    + "i32.store:2 i64.store:3 f32.store:2 f64.store:3 i32.store8:0 i32.store16:1 i64.store8:0 i64.store16:1 i64.store32:2"
).split(" ").map(entry => {
    const [name = "", align = "0"] = entry.split(":");
    return { name, align: Number(align) };
});

/** The 0xfc-prefixed saturating truncations, 0 to 7. */
const saturating = "i32.trunc_sat_f32_s i32.trunc_sat_f32_u i32.trunc_sat_f64_s i32.trunc_sat_f64_u i64.trunc_sat_f32_s i64.trunc_sat_f32_u i64.trunc_sat_f64_s i64.trunc_sat_f64_u".split(" ");

/**
 * The 0xfd-prefixed SIMD instructions, by subopcode: those taking a memory argument with their natural alignment's
 * log2, and those that also take a lane.
 */
const simd: { readonly [subopcode: number]: { readonly name: string; readonly align?: number; readonly lane?: true } } = {
    0: { name: "v128.load", align: 4 }, 11: { name: "v128.store", align: 4 }, 12: { name: "v128.const" },
    15: { name: "i32x4.splat" }, 16: { name: "i64x2.splat" }, 19: { name: "f32x4.splat" }, 20: { name: "f64x2.splat" },
    65: { name: "f32x4.eq" }, 66: { name: "f32x4.ne" }, 67: { name: "f32x4.lt" }, 68: { name: "f32x4.gt" }, 69: { name: "f32x4.le" }, 70: { name: "f32x4.ge" },
    71: { name: "f64x2.eq" }, 72: { name: "f64x2.ne" }, 73: { name: "f64x2.lt" }, 74: { name: "f64x2.gt" }, 75: { name: "f64x2.le" }, 76: { name: "f64x2.ge" },
    77: { name: "v128.not" }, 78: { name: "v128.and" }, 79: { name: "v128.andnot" }, 80: { name: "v128.or" }, 81: { name: "v128.xor" },
    82: { name: "v128.bitselect" }, 83: { name: "v128.any_true" },
    84: { name: "v128.load8_lane", align: 0, lane: true }, 85: { name: "v128.load16_lane", align: 1, lane: true },
    86: { name: "v128.load32_lane", align: 2, lane: true }, 87: { name: "v128.load64_lane", align: 3, lane: true },
    88: { name: "v128.store8_lane", align: 0, lane: true }, 89: { name: "v128.store16_lane", align: 1, lane: true },
    90: { name: "v128.store32_lane", align: 2, lane: true }, 91: { name: "v128.store64_lane", align: 3, lane: true },
    92: { name: "v128.load32_zero", align: 2 }, 93: { name: "v128.load64_zero", align: 3 },
    94: { name: "f32x4.demote_f64x2_zero" }, 95: { name: "f64x2.promote_low_f32x4" },
    103: { name: "f32x4.ceil" }, 104: { name: "f32x4.floor" }, 105: { name: "f32x4.trunc" }, 106: { name: "f32x4.nearest" },
    116: { name: "f64x2.ceil" }, 117: { name: "f64x2.floor" }, 122: { name: "f64x2.trunc" }, 148: { name: "f64x2.nearest" },
    199: { name: "i64x2.extend_low_i32x4_s" }, 200: { name: "i64x2.extend_high_i32x4_s" },
    224: { name: "f32x4.abs" }, 225: { name: "f32x4.neg" }, 227: { name: "f32x4.sqrt" }, 228: { name: "f32x4.add" }, 229: { name: "f32x4.sub" },
    230: { name: "f32x4.mul" }, 231: { name: "f32x4.div" }, 232: { name: "f32x4.min" }, 233: { name: "f32x4.max" },
    236: { name: "f64x2.abs" }, 237: { name: "f64x2.neg" }, 239: { name: "f64x2.sqrt" }, 240: { name: "f64x2.add" }, 241: { name: "f64x2.sub" },
    242: { name: "f64x2.mul" }, 243: { name: "f64x2.div" }, 244: { name: "f64x2.min" }, 245: { name: "f64x2.max" },
};

/** Control and variable instructions without immediates, or with those `instruction` reads. */
const control: { readonly [opcode: number]: string } = {
    0x00: "unreachable", 0x01: "nop", 0x02: "block", 0x03: "loop", 0x04: "if", 0x05: "else", 0x0b: "end", 0x0c: "br", 0x0d: "br_if",
    0x0f: "return", 0x10: "call", 0x1a: "drop", 0x1b: "select", 0x20: "local.get", 0x21: "local.set", 0x22: "local.tee",
    0x41: "i32.const", 0x42: "i64.const", 0x43: "f32.const", 0x44: "f64.const",
};

/** A number as WAT writes a float: JS's shortest round-tripping decimal, `inf` and `nan`, with a NaN's payload when it isn't the canonical one. */
const floatText = (value: number, bits: () => bigint, payloadBits: number): string => {
    if (Number.isNaN(value)) {
        const raw = bits();
        const sign = raw >> BigInt(payloadBits === 52 ? 63 : 31) !== 0n ? "-" : "";
        const payload = raw & ((1n << BigInt(payloadBits)) - 1n);
        return payload === 1n << BigInt(payloadBits - 1) ? `${sign}nan` : `${sign}nan:0x${payload.toString(16)}`;
    }
    if (value === Infinity) return "inf";
    if (value === -Infinity) return "-inf";
    return Object.is(value, -0) ? "-0" : String(value);
};

/** An identifier for a name, with characters WAT's identifiers don't allow replaced. */
const identifier = (name: string): string => `$${name.replace(/[^A-Za-z0-9_.+\-*/\\^~=<>!?@#$%&|:'`]/g, "_")}`;

/** Prints a module the kernel generator emitted as WAT, or says why it can't. */
export const printWat = (bytes: Uint8Array): Wat => {
    let at = 0;
    const failure = (message: string): Wat => ({ failure: `${message} at byte ${at}` });
    const byte = (): number => {
        if (at >= bytes.length) throw new RangeError("the module ends early");
        return bytes[at++] ?? 0;
    };
    const unsigned = (): number => {
        let result = 0;
        let scale = 1;
        for (;;) {
            const next = byte();
            result += (next & 0x7f) * scale;
            scale *= 128;
            if ((next & 0x80) === 0) return result;
        }
    };
    const signed = (size: number): bigint => {
        let result = 0n;
        let shift = 0n;
        for (;;) {
            const next = byte();
            result |= BigInt(next & 0x7f) << shift;
            shift += 7n;
            if ((next & 0x80) === 0) {
                if (shift < BigInt(size) && (next & 0x40) !== 0) result |= -1n << shift;
                return BigInt.asIntN(size, result);
            }
        }
    };
    const take = (count: number): Uint8Array => {
        if (at + count > bytes.length) throw new RangeError("the module ends early");
        const taken = bytes.subarray(at, at + count);
        at += count;
        return taken;
    };
    const text = (): string => new TextDecoder().decode(take(unsigned()));
    const valueType = (): string => {
        const type = valueTypes[byte()];
        if (type === undefined) throw new RangeError("a value type isn't one of WASM's");
        return type;
    };

    try {
        const magic = take(8);
        if ([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00].some((expected, k) => magic[k] !== expected)) return failure("the bytes aren't a WASM module of version 1");
        type Signature = { readonly parameters: readonly string[]; readonly results: readonly string[] };
        const types: Signature[] = [];
        const imports: { readonly module: string; readonly name: string; readonly text: (names: ReadonlyMap<number, string>) => string }[] = [];
        let importedFunctions = 0;
        const functions: number[] = [];
        const exports: { readonly name: string; readonly kind: number; readonly index: number }[] = [];
        const bodies: { readonly start: number; readonly end: number }[] = [];
        const functionNames = new Map<number, string>();
        const localNames = new Map<number, Map<number, string>>();
        while (at < bytes.length) {
            const id = byte();
            const size = unsigned();
            const end = at + size;
            switch (id) {
                case 0: {
                    if (text() !== "name") break;
                    while (at < end) {
                        const kind = byte();
                        const subsectionEnd = unsigned() + at;
                        if (kind === 1) {
                            for (let count = unsigned(); count > 0; count--) {
                                const index = unsigned();
                                functionNames.set(index, text());
                            }
                        }
                        else if (kind === 2) {
                            for (let count = unsigned(); count > 0; count--) {
                                const index = unsigned();
                                const names = new Map<number, string>();
                                for (let locals = unsigned(); locals > 0; locals--) {
                                    const local = unsigned();
                                    names.set(local, text());
                                }
                                localNames.set(index, names);
                            }
                        }
                        at = subsectionEnd;
                    }
                    break;
                }
                case 1:
                    for (let count = unsigned(); count > 0; count--) {
                        if (byte() !== 0x60) return failure("a type isn't a function type");
                        const parameters = Array.from({ length: unsigned() }, valueType);
                        const results = Array.from({ length: unsigned() }, valueType);
                        types.push({ parameters, results });
                    }
                    break;
                case 2:
                    for (let count = unsigned(); count > 0; count--) {
                        const module = text();
                        const name = text();
                        const kind = byte();
                        if (kind === 0x00) {
                            const index = importedFunctions++;
                            const type = unsigned();
                            imports.push({ module, name, text: names => `(func ${names.get(index) ?? `(;${index};)`} (type ${type}))` });
                        }
                        else if (kind === 0x02) {
                            const flags = byte();
                            const minimum = unsigned();
                            const maximum = (flags & 1) !== 0 ? ` ${unsigned()}` : "";
                            imports.push({ module, name, text: () => `(memory ${minimum}${maximum}${(flags & 2) !== 0 ? " shared" : ""})` });
                        }
                        else return failure(`an import's kind, ${kind}, isn't a function's or a memory's`);
                    }
                    break;
                case 3:
                    for (let count = unsigned(); count > 0; count--) functions.push(unsigned());
                    break;
                case 7:
                    for (let count = unsigned(); count > 0; count--) {
                        const name = text();
                        const kind = byte();
                        exports.push({ name, kind, index: unsigned() });
                    }
                    break;
                case 10:
                    for (let count = unsigned(); count > 0; count--) {
                        const bodySize = unsigned();
                        bodies.push({ start: at, end: at + bodySize });
                        at += bodySize;
                    }
                    break;
                default:
                    return failure(`section ${id} isn't one the kernel generator emits`);
            }
            at = end;
        }

        /** Each function's name, unique, from the name section or its index. */
        const named = new Map<number, string>();
        const taken = new Set<string>();
        const unique = (name: string, used: Set<string>): string => {
            let candidate = identifier(name);
            for (let n = 1; used.has(candidate); n++) candidate = identifier(`${name}_${n}`);
            used.add(candidate);
            return candidate;
        };
        for (const [index, name] of functionNames) named.set(index, unique(name, taken));
        const lines = ["(module"];
        types.forEach(({ parameters, results }, index) => {
            const parts = [...parameters.length > 0 ? [`(param ${parameters.join(" ")})`] : [], ...results.length > 0 ? [`(result ${results.join(" ")})`] : []];
            lines.push(`  (type (;${index};) (func${parts.map(part => ` ${part}`).join("")}))`);
        });
        for (const entry of imports) lines.push(`  (import ${JSON.stringify(entry.module)} ${JSON.stringify(entry.name)} ${entry.text(named)})`);
        for (let k = 0; k < functions.length; k++) {
            const index = importedFunctions + k;
            const type = types[functions[k] ?? -1];
            const body = bodies[k];
            if (type === undefined || body === undefined) return failure(`function ${index} has no type or no body`);
            at = body.start;
            const used = new Set<string>();
            const locals = new Map<number, string>();
            for (const [local, name] of localNames.get(index) ?? []) locals.set(local, unique(name, used));
            const localOf = (local: number): string => locals.get(local) ?? String(local);
            const declared: string[] = [];
            for (let groups = unsigned(); groups > 0; groups--) {
                const count = unsigned();
                const type = valueType();
                for (let n = 0; n < count; n++) declared.push(type);
            }
            const parameters = type.parameters.map((parameter, local) => locals.has(local) ? `(param ${localOf(local)} ${parameter})` : `(param ${parameter})`);
            lines.push(`  (func ${named.get(index) ?? `(;${index};)`} (type ${functions[k]})${parameters.map(parameter => ` ${parameter}`).join("")}${type.results.length > 0 ? ` (result ${type.results.join(" ")})` : ""}`);
            declared.forEach((local, k) => {
                const index = type.parameters.length + k;
                lines.push(`    (local ${locals.has(index) ? `${localOf(index)} ` : ""}${local})`);
            });
            /** A memory argument as WAT writes it: its offset unless 0, and its alignment unless it's natural. */
            const memoryArgument = (natural: number): string => {
                const align = unsigned();
                const offset = unsigned();
                return `${offset === 0 ? "" : ` offset=${offset}`}${align === natural ? "" : ` align=${2 ** align}`}`;
            };
            const blockType = (): string => {
                const type = byte();
                if (type === 0x40) return "";
                const value = valueTypes[type];
                if (value === undefined) throw new RangeError("a block's type isn't a value type");
                return ` (result ${value})`;
            };
            let depth = 2;
            while (at < body.end) {
                const opcode = byte();
                const indent = (offset = 0): string => "  ".repeat(depth + offset);
                const name = control[opcode];
                if (opcode === 0x0b) {
                    depth--;
                    if (depth >= 2) lines.push(`${indent()}end`);
                    continue;
                }
                if (opcode === 0x05) {
                    lines.push(`${indent(-1)}else`);
                    continue;
                }
                if (opcode === 0x02 || opcode === 0x03 || opcode === 0x04) {
                    lines.push(`${indent()}${name}${blockType()}`);
                    depth++;
                    continue;
                }
                let instruction: string;
                if (opcode === 0x0c || opcode === 0x0d) instruction = `${name} ${unsigned()}`;
                else if (opcode === 0x10) {
                    const callee = unsigned();
                    instruction = `call ${named.get(callee) ?? callee}`;
                }
                else if (opcode >= 0x20 && opcode <= 0x22) instruction = `${name} ${localOf(unsigned())}`;
                else if (opcode === 0x41) instruction = `i32.const ${signed(32)}`;
                else if (opcode === 0x42) instruction = `i64.const ${signed(64)}`;
                else if (opcode === 0x43) {
                    const view = new DataView(take(4).slice().buffer);
                    instruction = `f32.const ${floatText(view.getFloat32(0, true), () => BigInt(view.getUint32(0, true)), 23)}`;
                }
                else if (opcode === 0x44) {
                    const view = new DataView(take(8).slice().buffer);
                    instruction = `f64.const ${floatText(view.getFloat64(0, true), () => view.getBigUint64(0, true), 52)}`;
                }
                else if (name !== undefined) instruction = name;
                else if (opcode >= 0x28 && opcode <= 0x3e) {
                    const access = memory[opcode - 0x28];
                    if (access === undefined) return failure(`opcode 0x${opcode.toString(16)} isn't one the printer reads`);
                    instruction = `${access.name}${memoryArgument(access.align)}`;
                }
                else if (opcode >= 0x45 && opcode <= 0xc4) instruction = numeric[opcode - 0x45] ?? "";
                else if (opcode === 0xfc) {
                    const subopcode = unsigned();
                    const saturated = saturating[subopcode];
                    if (saturated === undefined) return failure(`opcode 0xfc ${subopcode} isn't one the printer reads`);
                    instruction = saturated;
                }
                else if (opcode === 0xfd) {
                    const subopcode = unsigned();
                    const vector = simd[subopcode];
                    if (vector === undefined) return failure(`opcode 0xfd ${subopcode} isn't one the printer reads`);
                    if (subopcode === 12) instruction = `v128.const ${vectorConstant(take(16))}`;
                    else if (vector.align !== undefined) instruction = `${vector.name}${memoryArgument(vector.align)}${vector.lane === true ? ` ${byte()}` : ""}`;
                    else instruction = vector.name;
                }
                else return failure(`opcode 0x${opcode.toString(16)} isn't one the printer reads`);
                lines.push(`${indent()}${instruction}`);
            }
            lines.push("  )");
        }
        for (const entry of exports) {
            const kind = entry.kind === 0 ? "func" : entry.kind === 2 ? "memory" : null;
            if (kind === null) return failure(`an export's kind, ${entry.kind}, isn't a function's or a memory's`);
            lines.push(`  (export ${JSON.stringify(entry.name)} (${kind} ${kind === "func" ? named.get(entry.index) ?? entry.index : entry.index}))`);
        }
        lines.push(")");
        return { wat: lines.join("\n") };
    } catch (error) {
        if (error instanceof RangeError) return failure(error.message);
        throw error;
    }
};

/**
 * A v128 constant's lanes as the generator means them, two f64s or four f32s: whichever reads shorter, since the
 * other's lanes split or join its numbers' bytes; four i32s where a lane would be a NaN, whose payload a lane's text
 * doesn't keep.
 */
const vectorConstant = (bytes: Uint8Array): string => {
    const view = new DataView(bytes.slice().buffer);
    const doubles = [0, 8].map(offset => view.getFloat64(offset, true));
    const floats = [0, 4, 8, 12].map(offset => view.getFloat32(offset, true));
    const candidates = [
        ...doubles.some(Number.isNaN) ? [] : [`f64x2 ${doubles.map(value => floatText(value, () => 0n, 52)).join(" ")}`],
        ...floats.some(Number.isNaN) ? [] : [`f32x4 ${floats.map(value => floatText(value, () => 0n, 23)).join(" ")}`],
    ].sort((a, b) => a.length - b.length);
    return candidates[0] ?? `i32x4 ${[0, 4, 8, 12].map(offset => `0x${view.getUint32(offset, true).toString(16).padStart(8, "0")}`).join(" ")}`;
};
