// © 2026 Adobe. MIT License. See /LICENSE for details.

import { expect } from "vitest";
import type { TypedBuffer } from "../../typed-buffer/index.js";
import type { IterateAxis } from "./iterate-axis.js";
import type { Volume } from "./volume.js";

export interface SegmentRow {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly values: boolean[];
    readonly step: number;
    readonly pairCount: number;
    readonly done: boolean;
}

export const readAllSegmentValues = <T>(
    buffer: TypedBuffer<T>,
    segments: readonly number[],
    step: number,
): T[] => {
    const values: T[] = [];
    for (let i = 0; i < segments.length; i += 2) {
        const offset = segments[i]!;
        const length = segments[i + 1]!;
        for (let j = 0; j < length; j++) {
            values.push(buffer.get(offset + j * step));
        }
    }
    return values;
};

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
        expect(segments.length % 2).toBe(0);
        expect(segments.length).toBeGreaterThan(0);

        rows.push({
            x,
            y,
            z,
            values: readAllSegmentValues(buffer, segments, step) as boolean[],
            step,
            pairCount: segments.length / 2,
            done,
        });
    });

    return rows;
};
