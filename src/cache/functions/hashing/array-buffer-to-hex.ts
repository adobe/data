// © 2026 Adobe. MIT License. See /LICENSE for details.
export function arrayBufferToHex(buffer: ArrayBuffer): string {
    return [...new Uint8Array(buffer)]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
}
