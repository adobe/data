// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { World } from "@adobe/ecs";
import { createGpuUpdateEntities, gpuComplexSystemsUpdate, readGpuState } from "../scenarios/model/index.js";

/**
 * By value the worlds hold, how many rows differ and the words of a row that differ in any; for f32 pairs, the largest
 * difference of a field.
 */
export type LaneDifferences = { readonly [value: string]: { readonly rows: number; readonly differing: number; readonly words: readonly number[]; readonly largest?: number } };

/**
 * Runs `frames` of the 7-system GPU frame over `count` entities on the worlds, settling each, and compares what they
 * hold: each component's rows, and the frame buffer as a row.
 */
export const compareLanes = async (worlds: readonly [World, World], count: number, frames: number, settle: () => Promise<void>): Promise<LaneDifferences> => {
    const state = async (world: World) => {
        await world.run(createGpuUpdateEntities, { count });
        for (let frame = 0; frame < frames; frame++) {
            await world.run(gpuComplexSystemsUpdate);
            await settle();
        }
        return world.run(readGpuState);
    };
    const [first, second] = await Promise.all([state(worlds[0]), state(worlds[1])]);
    const differences: { [value: string]: { rows: number; differing: number; words: number[]; largest?: number } } = {};
    for (const [name, { bytes, stride }] of Object.entries(first.components)) {
        const other = second.components[name]?.bytes ?? new Uint8Array(0);
        const rows = stride === 0 ? 0 : bytes.length / stride;
        let differing = 0;
        const words = new Set<number>();
        for (let row = 0; row < rows; row++) {
            let differs = false;
            for (let k = 0; k < stride; k++) {
                if (bytes[row * stride + k] === other[row * stride + k]) continue;
                differs = true;
                words.add(k >> 2);
            }
            if (differs) differing++;
        }
        const floats = name === "position" || name === "velocity";
        let largest = 0;
        if (floats) {
            const a = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
            const b = new Float32Array(other.buffer, other.byteOffset, other.length / 4);
            for (let k = 0; k < a.length; k++) largest = Math.max(largest, Math.abs((a[k] ?? 0) - (b[k] ?? 0)));
        }
        const differingWords = [...words].sort((a, b) => a - b);
        differences[name] = floats ? { rows, differing, words: differingWords, largest } : { rows, differing, words: differingWords };
    }
    const cells = Array.from(first.frame.keys()).filter(k => first.frame[k] !== second.frame[k]);
    differences["frame"] = { rows: 1, differing: cells.length === 0 ? 0 : 1, words: cells.slice(0, 8) };
    return differences;
};
