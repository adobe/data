// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Diagnostic } from "../compile/diagnostic.js";
import type { Source } from "../compile/messages.js";

/** Checks a chapter's files, by their names: TypeScript's diagnostics for each, as of `version`. */
export type CheckRequest = { readonly kind: "check"; readonly version: number; readonly files: readonly Source[] };
/** A check's diagnostics; `failure` says why TypeScript itself failed, null when it didn't. */
export type CheckReply = { readonly kind: "checked"; readonly version: number; readonly diagnostics: readonly Diagnostic[]; readonly failure: string | null };

/** A run of text TypeScript describes, by its kind: `keyword`, `className`, `parameterName`, `link` and the rest. */
export type Part = { readonly text: string; readonly kind: string };

/**
 * What TypeScript says of what's at a place: its span in the file, its signature, its documentation, and its TSDoc tags
 * (`param`, `returns`, `example` and the rest), each as parts.
 */
export type QuickInfo = {
    readonly start: number; readonly length: number;
    readonly display: readonly Part[]; readonly documentation: readonly Part[];
    readonly tags: readonly { readonly name: string; readonly text: readonly Part[] }[];
};

/** Asks what's at `position` in the file named, of a chapter's files as they are now; `serial` tells replies apart. */
export type InfoRequest = { readonly kind: "info"; readonly serial: number; readonly files: readonly Source[]; readonly file: string; readonly position: number };
/** What's there, null for nothing; `failure` says why TypeScript itself failed. */
export type InfoReply = { readonly kind: "info"; readonly serial: number; readonly info: QuickInfo | null; readonly failure: string | null };

const isParts = (value: unknown): value is readonly Part[] => Array.isArray(value)
    && value.every(item => typeof item === "object" && item !== null && typeof Reflect.get(item, "text") === "string" && typeof Reflect.get(item, "kind") === "string");

/** Whether a value is what an info reply says of a place. */
export const isQuickInfo = (value: unknown): value is QuickInfo => {
    if (typeof value !== "object" || value === null) return false;
    const tags: unknown = Reflect.get(value, "tags");
    return typeof Reflect.get(value, "start") === "number" && typeof Reflect.get(value, "length") === "number"
        && isParts(Reflect.get(value, "display")) && isParts(Reflect.get(value, "documentation"))
        && Array.isArray(tags) && tags.every(tag => typeof tag === "object" && tag !== null && typeof Reflect.get(tag, "name") === "string" && isParts(Reflect.get(tag, "text")));
};

const isSources = (value: unknown): value is readonly Source[] => Array.isArray(value)
    && value.every(item => typeof item === "object" && item !== null && typeof Reflect.get(item, "name") === "string" && typeof Reflect.get(item, "code") === "string");

export const infoRequestOf = (data: unknown): InfoRequest | null => {
    if (typeof data !== "object" || data === null || Reflect.get(data, "kind") !== "info") return null;
    const serial: unknown = Reflect.get(data, "serial");
    const files: unknown = Reflect.get(data, "files");
    const file: unknown = Reflect.get(data, "file");
    const position: unknown = Reflect.get(data, "position");
    return typeof serial === "number" && isSources(files) && typeof file === "string" && typeof position === "number" ? { kind: "info", serial, files, file, position } : null;
};

export const checkRequestOf = (data: unknown): CheckRequest | null => {
    if (typeof data !== "object" || data === null || Reflect.get(data, "kind") !== "check") return null;
    const version: unknown = Reflect.get(data, "version");
    const files: unknown = Reflect.get(data, "files");
    return typeof version === "number" && isSources(files) ? { kind: "check", version, files } : null;
};
