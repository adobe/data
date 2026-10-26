// © 2026 Adobe. MIT License. See /LICENSE for details.
import { HighlightStyle, StreamLanguage, type StreamParser } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/** How the guide's code reads: its editor's and the compiled code's, in Spectrum's palette, whose tokens flip with the theme. */

/** The palette's custom properties, for a `:host` rule. */
export const codePalette = `
    --guide-code-text: var(--spectrum-gray-800); --guide-code-background: var(--spectrum-background-layer-1-color);
    --guide-code-gutter: var(--spectrum-gray-600); --guide-code-active: rgba(var(--spectrum-gray-900-rgb), 0.05);
    --guide-code-caret: var(--spectrum-accent-content-color-default); --guide-code-selection: rgba(var(--spectrum-blue-500-rgb), 0.35);
    --guide-code-keyword: var(--spectrum-magenta-900); --guide-code-string: var(--spectrum-seafoam-900); --guide-code-number: var(--spectrum-orange-900);
    --guide-code-comment: var(--spectrum-gray-600); --guide-code-type: var(--spectrum-indigo-900); --guide-code-function: var(--spectrum-blue-900);
    --guide-code-property: var(--spectrum-cyan-900);`;

export const codeHighlight = HighlightStyle.define([
    { tag: tags.keyword, color: "var(--guide-code-keyword)" },
    { tag: [tags.string, tags.regexp], color: "var(--guide-code-string)" },
    { tag: [tags.number, tags.bool, tags.null], color: "var(--guide-code-number)" },
    { tag: tags.comment, color: "var(--guide-code-comment)", fontStyle: "italic" },
    { tag: [tags.typeName, tags.className], color: "var(--guide-code-type)" },
    { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "var(--guide-code-function)" },
    { tag: tags.propertyName, color: "var(--guide-code-property)" },
    // WAT's and WGSL's instructions and names, which only their views mark.
    { tag: tags.atom, color: "var(--guide-code-function)" },
    { tag: tags.labelName, color: "var(--guide-code-property)" },
]);

/** The editor's look, shared by every view of code. */
export const codeTheme = EditorView.theme({
    "&": { height: "100%", fontSize: "var(--spectrum-font-size-75, 12px)", color: "var(--guide-code-text)", backgroundColor: "var(--guide-code-background)" },
    ".cm-scroller": { fontFamily: "var(--guide-code-font, ui-monospace, monospace)", lineHeight: "1.6" },
    ".cm-content": { padding: "var(--spectrum-spacing-100, 8px) 0" },
    ".cm-gutters": { backgroundColor: "var(--guide-code-background)", color: "var(--guide-code-gutter)", border: "none", paddingInlineStart: "var(--spectrum-spacing-75, 4px)" },
    ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "var(--guide-code-active)" },
    ".cm-activeLineGutter": { color: "var(--guide-code-text)" },
    // drawSelection hides the native caret and draws its own, by its left border.
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--guide-code-caret)", borderLeftWidth: "2px" },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionLayer .cm-selectionBackground": { backgroundColor: "var(--guide-code-selection)" },
    // Spectrum's focus indicator, inside the panel's edge, in place of CodeMirror's own.
    "&.cm-editor.cm-focused": { outline: "2px solid var(--spectrum-focus-indicator-color)", outlineOffset: "-2px" },
    // Every tooltip and panel CodeMirror can show, in place of its light base theme: lint's, autocomplete's and search's.
    ".cm-tooltip": {
        border: "1px solid var(--spectrum-gray-300)", borderRadius: "var(--spectrum-corner-radius-100, 4px)", overflow: "hidden",
        backgroundColor: "var(--spectrum-background-layer-2-color, var(--spectrum-gray-75))", color: "var(--spectrum-gray-800)",
        boxShadow: "var(--guide-elevation, 0 2px 8px rgba(0, 0, 0, 0.3))",
        font: "var(--spectrum-font-size-75, 12px)/1.45 var(--spectrum-sans-font-family-stack, system-ui, sans-serif)",
    },
    ".cm-tooltip-lint": { maxWidth: "min(560px, 90vw)" },
    ".cm-diagnostic": { padding: "6px 10px 6px 8px", color: "var(--spectrum-gray-800)" },
    ".cm-diagnostic + .cm-diagnostic": { borderTop: "1px solid var(--spectrum-gray-200)" },
    ".cm-diagnostic-error": { borderLeft: "3px solid var(--spectrum-negative-visual-color, var(--spectrum-red-900))" },
    ".cm-diagnostic-warning": { borderLeft: "3px solid var(--spectrum-notice-visual-color, var(--spectrum-orange-900))" },
    ".cm-diagnostic-info, .cm-diagnostic-hint": { borderLeft: "3px solid var(--spectrum-informative-visual-color, var(--spectrum-blue-900))" },
    ".cm-diagnosticSource": { color: "var(--spectrum-gray-700)", opacity: "1" },
    ".cm-diagnosticAction": { backgroundColor: "var(--spectrum-accent-background-color-default)", color: "var(--spectrum-white, white)" },
    ".cm-panels": { backgroundColor: "var(--spectrum-background-layer-2-color, var(--spectrum-gray-75))", color: "var(--spectrum-gray-800)", borderColor: "var(--spectrum-gray-300)" },
    ".cm-panel.cm-panel-lint ul [aria-selected], .cm-tooltip-autocomplete ul li[aria-selected]": {
        backgroundColor: "rgba(var(--spectrum-blue-500-rgb), 0.3)", color: "var(--spectrum-gray-900)",
    },
    ".cm-panel input, .cm-panel button, .cm-textfield": {
        backgroundColor: "var(--spectrum-background-layer-1-color)", color: "var(--spectrum-gray-800)", border: "1px solid var(--spectrum-gray-400)",
    },
});

/** A line-at-a-time tokenizer: comments from `comment`, strings in double quotes, numbers, then words by `wordTag`. */
const tokenizer = (comment: RegExp, wordTag: (word: string) => string | null): StreamParser<{ readonly block: boolean }> => ({
    token: stream => {
        if (stream.eatSpace()) return null;
        if (stream.match(comment)) {
            stream.skipToEnd();
            return "comment";
        }
        if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return "string";
        if (stream.match(/^[-+]?(?:0x[0-9a-fA-F_]+|(?:\d[\d_]*\.?\d*(?:[eE][-+]?\d+)?)|inf|nan(?::0x[0-9a-f]+)?)[uif]?(?:32|16)?\b/)) return "number";
        if (stream.match(/^\$[\w.$]+/)) return "labelName";
        const word = stream.match(/^[A-Za-z_][\w.]*/);
        if (typeof word === "object" && word !== null) return wordTag(word[0]);
        stream.next();
        return null;
    },
    startState: () => ({ block: false }),
});

/** WASM's text format: instructions and module fields as keywords, types as types, `$names` as labels. */
export const wat = StreamLanguage.define(tokenizer(/^;;/, word =>
    /^(i32|i64|f32|f64|v128|funcref|externref)$/.test(word) ? "typeName"
        : /^(module|type|func|param|result|local|import|export|memory|shared|offset|align)$/.test(word) ? "keyword"
            : word.includes(".") || /^(block|loop|if|else|end|br|br_if|call|drop|select|return|nop|unreachable)$/.test(word) ? "atom" : null));

/** WGSL: its keywords, attributes as keywords, and its types. */
export const wgsl = StreamLanguage.define(tokenizer(/^\/\//, word =>
    /^(fn|let|var|const|if|else|for|loop|return|break|continue|struct|true|false|select|bitcast)$/.test(word) ? "keyword"
        : /^(f32|i32|u32|bool|vec[234][fiu]?|mat\dx\d[fh]?|array|ptr|storage|read|read_write|uniform|private|workgroup|atomic)$/.test(word) ? "typeName" : null));
