// © 2026 Adobe. MIT License. See /LICENSE for details.

/** A field `<form-dialog>` asks for: its name, the value it's given back under, its label, kind and first value. */
export type DialogField = {
    readonly name: string;
    readonly label: string;
    readonly kind: "text" | "number";
    readonly value: string;
    readonly min?: number;
    readonly max?: number;
};
