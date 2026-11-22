// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * A model's cells, `size` of them in x-fastest order, `at(x, y, z)` naming each one's material or null for empty, as a
 * file keeps them: the materials named, and runs of a count then 0 for empty or 1 + an index into those names.
 */
export const encodeRuns = (size: readonly [number, number, number], at: (x: number, y: number, z: number) => string | null): { readonly palette: readonly string[]; readonly runs: readonly number[] } => {
    const palette: string[] = [];
    const indexOf = new Map<string, number>();
    const runs: number[] = [];
    let value = -1;
    let count = 0;
    for (let z = 0; z < size[2]; z++) {
        for (let y = 0; y < size[1]; y++) {
            for (let x = 0; x < size[0]; x++) {
                const name = at(x, y, z);
                let next = 0;
                if (name !== null) {
                    let index = indexOf.get(name);
                    if (index === undefined) {
                        index = palette.length;
                        palette.push(name);
                        indexOf.set(name, index);
                    }
                    next = index + 1;
                }
                if (next === value) count++;
                else {
                    if (count > 0) runs.push(count, value);
                    value = next;
                    count = 1;
                }
            }
        }
    }
    if (count > 0) runs.push(count, value);
    return { palette, runs };
};
