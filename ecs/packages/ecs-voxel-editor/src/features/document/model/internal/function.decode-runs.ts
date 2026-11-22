// © 2026 Adobe. MIT License. See /LICENSE for details.

/** Calls `fill` for each filled cell of a model `size` cells across that runs, as `encodeRuns` makes them, describe, with its material's name. */
export const decodeRuns = (size: readonly [number, number, number], voxels: { readonly palette: readonly string[]; readonly runs: readonly number[] }, fill: (x: number, y: number, z: number, material: string) => void): void => {
    const total = size[0] * size[1] * size[2];
    let cell = 0;
    for (let i = 0; i + 1 < voxels.runs.length && cell < total; i += 2) {
        const count = voxels.runs[i] ?? 0;
        const name = (voxels.runs[i + 1] ?? 0) === 0 ? null : voxels.palette[(voxels.runs[i + 1] ?? 1) - 1] ?? null;
        for (let k = 0; k < count && cell < total; k++, cell++) {
            if (name === null) continue;
            const x = cell % size[0];
            const y = Math.floor(cell / size[0]) % size[1];
            const z = Math.floor(cell / (size[0] * size[1]));
            fill(x, y, z, name);
        }
    }
};
