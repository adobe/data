// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Mat4x4 } from "./index.js";

type Index = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

export const multiply = (a: Mat4x4, b: Mat4x4): Mat4x4 => {
    const result: number[] = new Array(16);
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            let sum = 0;
            for (let k = 0; k < 4; k++) {
                sum += a[k * 4 + i as Index] * b[j * 4 + k as Index];
            }
            result[j * 4 + i] = sum;
        }
    }
    return result as unknown as Mat4x4;
};
