// © 2026 Adobe. MIT License. See /LICENSE for details.

/** Where a kernel's url goes in compiled code, until its module is compiled: the plugin's for node, the guide's. */
export const inlinePlaceholder = (index: number, hash: string): string => `@ecs-kernel-inline/${index}/${hash}`;

/** A module's source as base64, from its UTF-8 bytes. */
const base64 = (source: string): string => {
    let binary = "";
    for (const byte of new TextEncoder().encode(source)) binary += String.fromCharCode(byte);
    return btoa(binary);
};

/**
 * Code with each kernel's placeholder replaced by its module as a `data:` url, which imports on any thread, wherever
 * it's served from: in node, and in a browser's workers.
 */
export const inlineKernels = (code: string, kernels: readonly string[], hashes: readonly string[]): string =>
    kernels.reduce((inlined, source, index) => inlined.replaceAll(
        JSON.stringify(inlinePlaceholder(index, hashes[index] ?? "")),
        JSON.stringify(`data:text/javascript;base64,${base64(source)}`),
    ), code);
