// © 2026 Adobe. MIT License. See /LICENSE for details.
export const integerLength = (head: string): number => {
    if (head >= "a" && head <= "z") return head.charCodeAt(0) - "a".charCodeAt(0) + 2;
    if (head >= "A" && head <= "Z") return "Z".charCodeAt(0) - head.charCodeAt(0) + 2;
    throw new Error(`Invalid order key head: ${head}`);
};
