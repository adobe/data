/** Emitted statements. A function is rendered last, so it can see what the rest of the body needed. */
export type Out = (string | (() => string))[];

export const render = (out: Out): string => out.map(line => typeof line === "string" ? line : line()).filter(line => line !== "").join("\n");
