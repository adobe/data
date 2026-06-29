// © 2026 Adobe. MIT License. See /LICENSE for details.

import { expect } from "vitest";
import type { TypedBuffer } from "../../typed-buffer/index.js";
import type { Callback } from "./callback.js";
import type { IterateAxis } from "./iterate-axis.js";
import type { Volume } from "./volume.js";

export interface SegmentRow {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly values: boolean[];
    readonly step: number;
    readonly done: boolean;
}

export const collectAxisSegments = <T>(
    volume: Volume<T>,
    axis: IterateAxis,
): SegmentRow[] => {
    const iterate = axis === "x" ? volume.iterateX.bind(volume)
        : axis === "y" ? volume.iterateY.bind(volume)
            : volume.iterateZ.bind(volume);

    const rows: SegmentRow[] = [];
    let segmentsRef: number[] | undefined;

    iterate((buffer: TypedBuffer<T>, segments: number[], step: number, x: number, y: number, z: number, done: boolean) => {
        if (segmentsRef === undefined) {
            segmentsRef = segments;
        } else {
            expect(segments).toBe(segmentsRef);
        }
        expect(segments).toHaveLength(2);

        const offset = segments[0];
        const length = segments[1];
        const values: boolean[] = [];
        for (let i = 0; i < length; i++) {
            values.push(buffer.get(offset + i * step) as boolean);
        }
        rows.push({ x, y, z, values, step, done });
    });

    return rows;
};

export const readSegment = <T>(buffer: TypedBuffer<T>, segments: number[], step: number): T[] => {
    const offset = segments[0];
    const length = segments[1];
    const values: T[] = [];
    for (let i = 0; i < length; i++) {
        values.push(buffer.get(offset + i * step));
    }
    return values;
};
