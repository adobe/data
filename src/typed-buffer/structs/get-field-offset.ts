// © 2026 Adobe. MIT License. See /LICENSE for details.
import { StructLayout } from "./struct-layout.js";

export const getFieldOffset = (field: StructLayout['fields'][string], parentOffset: string): string => {
    const fieldOffset = field.offset / 4;
    if (!parentOffset) {
        return `index + ${fieldOffset}`;
    }
    // If parentOffset is a number, add it to fieldOffset
    const match = parentOffset.match(/^index \+ (\d+)$/);
    if (match) {
        const parentNum = parseInt(match[1]);
        return `index + ${parentNum + fieldOffset}`;
    }
    return `${parentOffset} + ${fieldOffset}`;
};
