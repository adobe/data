// © 2026 Adobe. MIT License. See /LICENSE for details.
import { locateIn, type Module } from './module-scope.js';

const base64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** One mapping: a generated column and the source line and column it came from, all counted from 0. */
type Segment = { readonly column: number; readonly sourceLine: number; readonly sourceColumn: number };

/** Decodes a source map's `mappings` into each generated line's segments that name a source position. */
export const decodeMappings = (mappings: string): readonly (readonly Segment[])[] => {
    const lines: Segment[][] = [];
    let sourceLine = 0;
    let sourceColumn = 0;
    for (const line of mappings.split(";")) {
        const segments: Segment[] = [];
        let column = 0;
        for (const text of line.split(",")) {
            if (text === "") continue;
            const values: number[] = [];
            let value = 0;
            let shift = 0;
            for (const character of text) {
                const digit = base64.indexOf(character);
                value += (digit & 31) << shift;
                if (digit & 32) shift += 5;
                else {
                    values.push(value & 1 ? -(value >>> 1) : value >>> 1);
                    value = 0;
                    shift = 0;
                }
            }
            column += values[0] ?? 0;
            if (values.length < 4) continue;
            sourceLine += values[2] ?? 0;
            sourceColumn += values[3] ?? 0;
            segments.push({ column, sourceLine, sourceColumn });
        }
        lines.push(segments);
    }
    return lines;
};

/** Locates offsets in `code` at the source positions its map's `mappings` give: the nearest mapping at or before each. */
export const locateThroughMap = (code: string, mappings: string): Module["locate"] => {
    const generated = locateIn(code);
    const lines = decodeMappings(mappings);
    return offset => {
        const { line, column } = generated(offset);
        for (let index = line - 1; index >= 0; index--) {
            const segments = lines[index] ?? [];
            const found = [...segments].reverse().find(segment => index < line - 1 || segment.column <= column - 1);
            if (found !== undefined) return { line: found.sourceLine + 1, column: found.sourceColumn + 1 + (index === line - 1 ? column - 1 - found.column : 0) };
        }
        return { line, column };
    };
};

/** A source map of one source, version 3, as a bundler takes one from a transform. */
export type SourceMap = { readonly version: 3; readonly sources: string[]; readonly sourcesContent: string[]; readonly names: string[]; readonly mappings: string };

/** Text inserted before the character at offset `at`; insertions at one offset keep their order. */
export type Insertion = { readonly at: number; readonly text: string };

/** Appends `value` as a base64 VLQ, the sign in its lowest bit. */
const encode = (value: number, into: string[]): void => {
    let rest = value < 0 ? (-value << 1) | 1 : value << 1;
    do {
        let digit = rest & 31;
        rest >>>= 5;
        if (rest > 0) digit |= 32;
        into.push(base64[digit] ?? "");
    } while (rest > 0);
};

const word = /[\w$]/;

/**
 * `code` with `insertions` made, and its map back to `code` named `source`. Every character of `code` keeps its source
 * position: a segment starts each line, each word or run of other characters, and what follows an insertion, so a
 * position maps to its own column without interpolating. Inserted text maps to nothing of its own.
 */
export const insertInto = (code: string, insertions: readonly Insertion[], source: string): { readonly code: string; readonly map: SourceMap } => {
    const ordered = insertions.map((insertion, order) => ({ insertion, order })).sort((a, b) => a.insertion.at - b.insertion.at || a.order - b.order);
    const output: string[] = [];
    const mappings: string[] = [];
    let generatedColumn = 0;
    let lineHasSegment = false;
    let lastGeneratedColumn = 0;
    let lastSourceLine = 0;
    let lastSourceColumn = 0;
    let sourceLine = 0;
    let sourceColumn = 0;
    let next = 0;
    let inserted = true;
    const newLine = (): void => {
        mappings.push(";");
        generatedColumn = 0;
        lastGeneratedColumn = 0;
        lineHasSegment = false;
    };
    const write = (text: string): void => {
        output.push(text);
        for (let k = 0; k < text.length; k++) {
            if (text[k] === "\n") newLine();
            else generatedColumn++;
        }
    };
    for (let at = 0; at <= code.length; at++) {
        while (next < ordered.length && ordered[next].insertion.at === at) {
            write(ordered[next++].insertion.text);
            inserted = true;
        }
        if (at === code.length) break;
        const character = code[at] ?? "";
        if (character !== "\n" && (inserted || sourceColumn === 0 || word.test(character) !== word.test(code[at - 1] ?? ""))) {
            if (lineHasSegment) mappings.push(",");
            encode(generatedColumn - lastGeneratedColumn, mappings);
            encode(0, mappings);
            encode(sourceLine - lastSourceLine, mappings);
            encode(sourceColumn - lastSourceColumn, mappings);
            lastGeneratedColumn = generatedColumn;
            lastSourceLine = sourceLine;
            lastSourceColumn = sourceColumn;
            lineHasSegment = true;
        }
        inserted = false;
        write(character);
        if (character === "\n") {
            sourceLine++;
            sourceColumn = 0;
        }
        else sourceColumn++;
    }
    return { code: output.join(""), map: { version: 3, sources: [source], sourcesContent: [code], names: [], mappings: mappings.join("") } };
};
