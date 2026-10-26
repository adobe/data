// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * A problem with an example, located in its file, counted from 1: TypeScript's, or the ECS build's (`Compiler.plugin()`
 * as the guide runs it in the browser). `length` is how many characters it spans, when its source tells.
 */
export type Diagnostic = {
    readonly kind: "typescript" | "build";
    readonly severity: "error" | "warning";
    readonly file: string;
    readonly message: string;
    readonly line: number | null;
    readonly column: number | null;
    readonly length: number | null;
};

const isCount = (value: unknown): boolean => value === null || typeof value === "number";

/** Whether a worker's message holds a diagnostic. */
export const isDiagnostic = (value: unknown): value is Diagnostic => typeof value === "object" && value !== null
    && (Reflect.get(value, "kind") === "typescript" || Reflect.get(value, "kind") === "build")
    && (Reflect.get(value, "severity") === "error" || Reflect.get(value, "severity") === "warning")
    && typeof Reflect.get(value, "file") === "string" && typeof Reflect.get(value, "message") === "string"
    && isCount(Reflect.get(value, "line")) && isCount(Reflect.get(value, "column")) && isCount(Reflect.get(value, "length"));
