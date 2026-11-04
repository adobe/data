// © 2026 Adobe. MIT License. See /LICENSE for details.

/** A file breaking a rule of the standard: the file, relative to the source folder, the rule's id, what's wrong and how to fix it. */
export type Violation = {
    readonly file: string;
    readonly rule: string;
    readonly problem: string;
    readonly fix: string;
};
