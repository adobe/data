// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ParseModule, StripTypes } from './memory-compiler.js';
import type { TypedProgram } from './type-schemas.js';

/** An error oxc reports, by the fields read here. */
type OxcError = { readonly message: string; readonly labels: readonly { readonly start: number }[] };

/** What oxc's parser binding gives: its parse, with the program as ESTree JSON, as its WASM build exports it too. */
export type OxcParser = {
    readonly parseSync: (filename: string, source: string, options: { readonly lang: "js" | "ts" | "tsx"; readonly preserveParens: boolean }) => { readonly program: unknown; readonly errors: readonly OxcError[] };
};

/** What oxc's transformer binding gives, by the fields read here. */
export type OxcTransformer = {
    readonly transformSync: (filename: string, source: string, options: { readonly lang: "js" | "ts" | "tsx"; readonly sourcemap: boolean }) => {
        readonly code: string; readonly map?: { readonly mappings: string }; readonly errors: readonly OxcError[];
    };
};

/** Whether a value is a program as the parser gives one, by the fields every program has. */
const isProgram = (value: unknown): value is TypedProgram =>
    typeof value === "object" && value !== null && Reflect.get(value, "type") === "Program" && Array.isArray(Reflect.get(value, "body"));

/** A literal's value JSON can't hold: a BigInt's, or a regular expression's, at a path the parser lists. */
const fixLiteral = (program: TypedProgram, path: readonly (string | number)[]): void => {
    let node: unknown = program;
    for (const key of path) node = typeof node === "object" && node !== null ? Reflect.get(node, key) : undefined;
    if (typeof node !== "object" || node === null) return;
    const bigint: unknown = Reflect.get(node, "bigint");
    if (typeof bigint === "string") {
        Reflect.set(node, "value", BigInt(bigint));
        return;
    }
    const regex: unknown = Reflect.get(node, "regex");
    if (typeof regex !== "object" || regex === null) return;
    try {
        Reflect.set(node, "value", new RegExp(String(Reflect.get(regex, "pattern")), String(Reflect.get(regex, "flags"))));
    } catch {
        // A pattern this engine can't compile keeps no value, as the bundler's parser leaves it.
    }
};

/** A parse failure as the bundler's `parseAst` throws one: its errors' messages, at the first one's position. */
const parseError = (errors: readonly OxcError[]): Error => {
    const error = new Error(`Parse failed with ${errors.length} error${errors.length < 2 ? "" : "s"}:\n${errors.slice(0, 5).map(item => item.message).join("\n")}`);
    const position = errors[0]?.labels[0]?.start;
    if (position !== undefined) Reflect.set(error, "pos", position);
    return error;
};

/**
 * The bundler's `parseAst`, over oxc's parser binding: the same parser, the same options and the same ESTree JSON it
 * reads back, so a program is the one the plugin reads (`oxc.test.ts`).
 */
export const oxcParse = (parser: OxcParser): ParseModule => (code, options, file) => {
    // A result's fields move out of the binding when read, so each is read once.
    const { errors, program: text } = parser.parseSync(file ?? "file.js", code, { lang: options.lang, preserveParens: false });
    if (errors.length > 0) throw parseError(errors);
    // The binding's declarations type the program as a node, but it's the JSON its wrapper parses.
    if (typeof text !== "string") throw new Error(`the parser gave no program JSON for ${file ?? "file.js"}`);
    const parsed: unknown = JSON.parse(text);
    const program: unknown = typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "node") : undefined;
    const fixes: unknown = typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "fixes") : undefined;
    if (!isProgram(program)) throw new Error(`the parser gave no program for ${file ?? "file.js"}`);
    if (Array.isArray(fixes)) for (const path of fixes) if (Array.isArray(path)) fixLiteral(program, path);
    return program;
};

/** The offset in a string, counted in UTF-16 code units as JavaScript counts them, of a UTF-8 byte offset in it. */
export const utf16Offset = (code: string, bytes: number): number => {
    let counted = 0;
    for (let index = 0; index < code.length; index++) {
        if (counted >= bytes) return index;
        const point = code.codePointAt(index) ?? 0;
        counted += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
        // A code point beyond the basic plane takes two code units.
        if (point >= 0x10000) index++;
    }
    return code.length;
};

/** The bundler's `transformWithOxc` stripping types, over oxc's transformer binding: the same JavaScript (`oxc.test.ts`). */
export const oxcStrip = (transformer: OxcTransformer): StripTypes => (code, file, lang) => {
    const { code: stripped, map, errors } = transformer.transformSync(file, code, { lang, sourcemap: true });
    const [first] = errors;
    // The transformer's labels count UTF-8 bytes, where the parser's count UTF-16 code units.
    const start = first?.labels[0]?.start;
    if (first !== undefined) return { error: `Transform failed: ${first.message}`, position: start === undefined ? undefined : utf16Offset(code, start) };
    return { code: stripped, mappings: map?.mappings ?? "" };
};
