// © 2026 Adobe. MIT License. See /LICENSE for details.
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { bracketMatching, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { lintGutter, setDiagnostics, type Diagnostic as LintDiagnostic } from "@codemirror/lint";
import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view";
import { codeHighlight, codePalette, codeTheme } from "../../../shared/elements/code.js";
import { infoSource, quickInfo, rehover, type HoverInfo } from "./quick-info.js";
import { openSystem, setMarks, systemMarks, type MarkedSystem } from "./system-marks.js";

export type { HoverInfo } from "./quick-info.js";

/** Asks what TypeScript says is at a position in a file whose text is `code`, or null for nothing. */
export type InfoAsk = (file: string, code: string, position: number) => Promise<HoverInfo | null>;

export type { MarkedSystem } from "./system-marks.js";

/**
 * `<guide-editor>`: one example file, edited in place with CodeMirror. `file` is its name and its code;
 * `problems` are marked in it, TypeScript's and the ECS build's each in a style of their own; `revealed` scrolls to
 * lines and selects them, once for each `serial`. Each edit dispatches `guide-edit` with the code, and the element
 * keeps it while whoever owns the file writes it back; code that differs from what's shown replaces it. `systems` are
 * marked at their calls with what they compile to, dimmed while `systemsStale`; choosing one dispatches
 * `guide-open-system` with the file's name and the call's start. `quickInfo` answers what's at a place, which hovering
 * it shows, as does Ctrl or Cmd+K then I at the cursor.
 */

/** A problem as the editor marks it: where it is, counted from 1, and whose it is. */
export type EditorProblem = {
    readonly kind: "typescript" | "build";
    readonly severity: "error" | "warning";
    readonly message: string;
    readonly line: number | null;
    readonly column: number | null;
    readonly length: number | null;
};

/** A file as the editor shows it. */
export type EditorFile = { readonly name: string; readonly code: string };

/** Lines to show and select, from `from` to `to`, at `column` of the first, once for each `serial`. */
export type EditorReveal = { readonly from: number; readonly to: number; readonly column: number; readonly serial: number };

export type GuideEditorEvents = {
    readonly "guide-edit": CustomEvent<{ readonly name: string; readonly code: string }>;
    readonly "guide-open-system": CustomEvent<{ readonly file: string; readonly start: number }>;
};

const theme = EditorView.theme({
    ".cm-problem-typescript": { textDecoration: "underline wavy var(--guide-typescript)", textUnderlineOffset: "3px" },
    ".cm-problem-build": { textDecoration: "underline dashed var(--guide-build)", textUnderlineOffset: "3px", backgroundColor: "var(--guide-build-background)" },
    ".cm-problem-kind": {
        display: "inline-block", marginInlineEnd: "8px", padding: "0 6px", borderRadius: "var(--spectrum-corner-radius-100, 4px)",
        font: "700 var(--spectrum-font-size-50, 11px)/18px var(--spectrum-sans-font-family-stack, system-ui, sans-serif)", color: "var(--spectrum-gray-50)",
    },
    ".cm-problem-kind.typescript": { backgroundColor: "var(--guide-typescript)" },
    ".cm-problem-kind.build": { backgroundColor: "var(--guide-build)" },
});

const template = document.createElement("template");
template.innerHTML = `
<style>
    /* Spectrum's palette, whose tokens flip with the theme, so one mapping reads in dark and light. */
    :host { display: block; position: relative; min-height: 0; overflow: hidden; ${codePalette}
        --guide-build-background: rgba(var(--spectrum-purple-900-rgb), 0.12); }
    .editor { position: absolute; inset: 0; }
</style>
<div class="editor"></div>`;

const extensions = (onEdit: (code: string) => void, onOpen: (start: number) => void, onInfo: (position: number) => Promise<HoverInfo | null>): Extension[] => [
    lineNumbers(), highlightActiveLineGutter(), history(), drawSelection(), indentOnInput(), bracketMatching(), highlightActiveLine(),
    syntaxHighlighting(codeHighlight), javascript({ typescript: true }), lintGutter(), codeTheme, theme, systemMarks,
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    EditorState.tabSize.of(4), openSystem.of(onOpen), infoSource.of(onInfo), quickInfo,
    EditorView.updateListener.of(update => {
        if (update.docChanged) onEdit(update.state.doc.toString());
    }),
];

/** A problem's span in a document: its line and column, and its length, or the word it starts, or its line's rest. */
const spanOf = (state: EditorState, problem: EditorProblem): { readonly from: number; readonly to: number } => {
    const line = state.doc.line(Math.min(Math.max(problem.line ?? 1, 1), state.doc.lines));
    const from = Math.min(line.from + Math.max((problem.column ?? 1) - 1, 0), line.to);
    if (problem.length !== null && problem.length > 0) return { from, to: Math.min(from + problem.length, state.doc.length) };
    const word = /^[\w$]+/.exec(state.doc.sliceString(from, line.to))?.[0].length ?? 0;
    return { from, to: word > 0 ? from + word : Math.max(line.to, from) };
};

/** A problem's message as its tooltip shows it: marked as TypeScript's or the ECS build's, as the Problems tab marks it. */
const messageOf = (problem: EditorProblem): Node => {
    const message = document.createElement("span");
    const kind = document.createElement("span");
    kind.className = `cm-problem-kind ${problem.kind}`;
    kind.textContent = problem.kind === "typescript" ? "TypeScript" : "ECS build";
    message.append(kind, problem.message);
    return message;
};

const lintOf = (state: EditorState, problem: EditorProblem): LintDiagnostic => ({
    ...spanOf(state, problem),
    severity: problem.severity,
    message: problem.message,
    renderMessage: () => messageOf(problem),
    markClass: `cm-problem-${problem.kind}`,
});

export class GuideEditor extends HTMLElement {
    readonly #view: EditorView;
    #name = "";
    #problems: readonly EditorProblem[] = [];
    #revealed: EditorReveal | null = null;
    #systems: readonly MarkedSystem[] = [];
    #systemsStale = false;
    #quickInfo: InfoAsk | null = null;
    /** What was last marked, so marking the same again changes nothing a pointer hovers. */
    #marked: { readonly doc: unknown; readonly problems: string } | null = null;
    #lensLines = "";
    /** Whether the code shown changes because the owner wrote it, which isn't an edit. */
    #writing = false;

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.append(template.content.cloneNode(true));
        const parent = root.querySelector(".editor");
        if (!(parent instanceof HTMLElement)) throw new Error("guide-editor's template is missing its editor.");
        this.#view = new EditorView({ parent, root, state: this.#stateOf("") });
    }

    #stateOf(code: string): EditorState {
        return EditorState.create({
            doc: code,
            extensions: extensions(edited => {
                if (this.#writing) return;
                this.dispatchEvent(new CustomEvent("guide-edit", { detail: { name: this.#name, code: edited }, bubbles: true, composed: true }));
            }, start => this.dispatchEvent(new CustomEvent("guide-open-system", { detail: { file: this.#name, start }, bubbles: true, composed: true })),
            position => this.#quickInfo?.(this.#name, this.#view.state.doc.toString(), position) ?? Promise.resolve(null)),
        });
    }

    get file(): EditorFile {
        return { name: this.#name, code: this.#view.state.doc.toString() };
    }

    /** Another file starts a history of its own; new code for the same file replaces what's shown, as one edit. */
    set file(value: EditorFile) {
        if (value.name !== this.#name) {
            this.#name = value.name;
            this.#view.setState(this.#stateOf(value.code));
            this.setAttribute("aria-label", value.name);
            this.#mark();
            this.#markSystems();
            return;
        }
        if (value.code === this.#view.state.doc.toString()) return;
        this.#writing = true;
        this.#view.dispatch({ changes: { from: 0, to: this.#view.state.doc.length, insert: value.code } });
        this.#writing = false;
        this.#mark();
    }

    get problems(): readonly EditorProblem[] {
        return this.#problems;
    }

    set problems(value: readonly EditorProblem[]) {
        if (value === this.#problems) return;
        this.#problems = value;
        this.#mark();
    }

    get quickInfo(): InfoAsk | null {
        return this.#quickInfo;
    }

    set quickInfo(value: InfoAsk | null) {
        this.#quickInfo = value;
    }

    get systems(): readonly MarkedSystem[] {
        return this.#systems;
    }

    set systems(value: readonly MarkedSystem[]) {
        if (value === this.#systems) return;
        this.#systems = value;
        this.#markSystems();
    }

    get systemsStale(): boolean {
        return this.#systemsStale;
    }

    set systemsStale(value: boolean) {
        if (value === this.#systemsStale) return;
        this.#systemsStale = value;
        this.#markSystems();
    }

    get revealed(): EditorReveal | null {
        return this.#revealed;
    }

    set revealed(value: EditorReveal | null) {
        if (value === null || value.serial === this.#revealed?.serial) {
            this.#revealed = value;
            return;
        }
        this.#revealed = value;
        const { doc } = this.#view.state;
        const first = doc.line(Math.min(Math.max(value.from, 1), doc.lines));
        const last = doc.line(Math.min(Math.max(value.to, value.from, 1), doc.lines));
        const anchor = Math.min(first.from + Math.max(value.column - 1, 0), first.to);
        this.#view.dispatch({
            selection: value.from === value.to ? EditorSelection.cursor(anchor) : EditorSelection.range(first.from, last.to),
            effects: EditorView.scrollIntoView(anchor, { y: "start", yMargin: 24 }),
        });
        this.#view.focus();
    }

    /** Marks the systems on the document as it is now, which keeps its state: its history, selection and scroll. */
    #markSystems(): void {
        // Lenses added, removed or moved move the lines under a resting pointer, which hovers again.
        const lines = this.#systems.map(system => system.line).join();
        const moved = lines !== this.#lensLines;
        this.#lensLines = lines;
        this.#view.dispatch({ effects: [setMarks.of({ systems: this.#systems, stale: this.#systemsStale }), ...moved ? [rehover.of(null)] : []] });
    }

    /** Marks the problems, unless they're those marked already, in this document: marking them hides their tooltip. */
    #mark(): void {
        const { state } = this.#view;
        const diagnostics = this.#problems.map(problem => lintOf(state, problem));
        const problems = JSON.stringify(diagnostics.map(({ from, to, severity, message, markClass }) => [from, to, severity, message, markClass]));
        // The same document's text is the same object, so problems marked in it before are still where they were.
        if (this.#marked?.doc === state.doc && this.#marked.problems === problems) return;
        this.#marked = { doc: state.doc, problems };
        const transaction = setDiagnostics(state, diagnostics);
        this.#view.dispatch({ ...transaction, effects: [...[transaction.effects ?? []].flat(), rehover.of(null)] });
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "guide-editor": GuideEditor;
    }
    interface HTMLElementEventMap extends GuideEditorEvents {}
}
