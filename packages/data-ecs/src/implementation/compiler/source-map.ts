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
