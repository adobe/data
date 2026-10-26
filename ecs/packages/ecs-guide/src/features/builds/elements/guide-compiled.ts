// © 2026 Adobe. MIT License. See /LICENSE for details.
import { javascript } from "@codemirror/lang-javascript";
import { syntaxHighlighting, type Language } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { codeHighlight, codePalette, codeTheme, wat, wgsl } from "../../../shared/elements/code.js";

/**
 * `<guide-compiled>`: what each system of a chapter's files compiles to. `systems` lists them by file; each is a row
 * naming it and its kind, with a tab per backend that's a badge of what the backend gives it: choosing one expands the
 * row at it, showing its code, read-only and highlighted, code it would compile to under a note of how, or why it
 * gives none. A backend's code is viewed only once
 * its tab is open. `stale` says they're from a build before an edit that failed to compile. `opened` expands one system,
 * at its backend that runs it, once for each `serial`. A system's line link dispatches `guide-locate` with its place.
 */

export type CompiledBackend =
    | { readonly kind: "compiled"; readonly code: string }
    | { readonly kind: "eligible"; readonly code: string; readonly reason: string }
    | { readonly kind: "registration"; readonly reason: string }
    | { readonly kind: "none"; readonly reason: string };

export type CompiledSystem = {
    readonly start: number;
    readonly line: number;
    readonly column: number;
    readonly binding: string | null;
    readonly kind: string;
    readonly kernel: boolean | "gpu" | null;
    readonly runs: string;
    readonly js: CompiledBackend;
    readonly wasm: CompiledBackend;
    readonly wgsl: CompiledBackend;
};

export type CompiledFile = { readonly file: string; readonly systems: readonly CompiledSystem[] };

/** A system to open, by its file and its call's start, once for each `serial`. */
export type OpenedSystem = { readonly file: string; readonly start: number; readonly serial: number };

type BackendKey = "js" | "wasm" | "wgsl";
const backends: readonly { readonly key: BackendKey; readonly label: string; readonly language: () => Language }[] = [
    { key: "js", label: "JS", language: () => javascript().language },
    { key: "wasm", label: "WASM", language: () => wat },
    { key: "wgsl", label: "WGSL", language: () => wgsl },
];

const states = { compiled: "positive", eligible: "neutral", registration: "neutral", none: "neutral" } as const;
const stateWords = { compiled: "compiled", eligible: "would compile", registration: "at registration", none: "not compiled" } as const;

/** The backend that runs a system by default, which opening it shows: its shader for a GPU kernel, else WASM, else its JS. */
const defaultBackend = (system: CompiledSystem): BackendKey =>
    system.kernel === "gpu" && system.wgsl.kind === "compiled" ? "wgsl"
        : system.wasm.kind === "compiled" ? "wasm" : system.js.kind === "compiled" ? "js"
            : system.wgsl.kind === "eligible" ? "wgsl" : "js";

const nameOf = (system: CompiledSystem): string => system.binding ?? `line ${system.line}`;
const keyOf = (file: string, system: CompiledSystem): string => `${file}#${nameOf(system)}`;
const kernelWords = (system: CompiledSystem): string => system.kernel === null ? "" : ` · kernel: ${system.kernel === "gpu" ? "\"gpu\"" : String(system.kernel)}`;

const template = document.createElement("template");
template.innerHTML = `
<style>
    :host { display: block; overflow: auto; color: var(--spectrum-gray-800); ${codePalette}
        font: var(--spectrum-font-size-100, 14px)/1.45 var(--spectrum-sans-font-family-stack, system-ui, sans-serif); }
    .stale { margin: var(--spectrum-spacing-100, 8px); padding: var(--spectrum-spacing-100, 8px) var(--spectrum-spacing-200, 12px);
        border-radius: var(--spectrum-corner-radius-100, 4px); color: var(--spectrum-notice-content-color-default, var(--spectrum-gray-800));
        background: color-mix(in srgb, var(--spectrum-notice-background-color-default, orange) 14%, transparent); }
    .empty { margin: 0; padding: var(--spectrum-spacing-200, 12px) var(--spectrum-spacing-300, 16px); color: var(--spectrum-gray-600); }
    h3 { margin: var(--spectrum-spacing-200, 12px) var(--spectrum-spacing-300, 16px) var(--spectrum-spacing-75, 4px);
        font: 600 var(--spectrum-font-size-75, 12px) var(--guide-code-font, ui-monospace, monospace); color: var(--spectrum-gray-600); }
    ul { list-style: none; margin: 0; padding: var(--spectrum-spacing-75, 4px) var(--spectrum-spacing-100, 8px); }
    li { border-radius: var(--spectrum-corner-radius-100, 4px); }
    li + li { margin-top: 2px; }
    .row { display: flex; align-items: center; gap: var(--spectrum-spacing-100, 8px); }
    .toggle { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 4px var(--spectrum-spacing-100, 8px);
        padding: var(--spectrum-spacing-75, 6px) var(--spectrum-spacing-100, 8px); border: 0; border-radius: var(--spectrum-corner-radius-100, 4px);
        background: none; color: inherit; font: inherit; text-align: start; cursor: pointer; }
    .toggle:hover { background: var(--spectrum-gray-100); }
    .toggle:focus-visible, .line:focus-visible { outline: 2px solid var(--spectrum-focus-indicator-color); outline-offset: -2px; }
    .chevron { display: inline-block; width: 0.8em; transition: transform 120ms; color: var(--spectrum-gray-600); }
    [aria-expanded=true] .chevron { transform: rotate(90deg); }
    .name { font: 600 var(--spectrum-font-size-100, 14px) var(--guide-code-font, ui-monospace, monospace); }
    .meta { color: var(--spectrum-gray-600); font-size: var(--spectrum-font-size-75, 12px); }
    .row { flex-wrap: wrap; }
    [role=tablist] { display: inline-flex; gap: 2px; }
    [role=tab] { position: relative; padding: 4px 3px 6px; border: 0; border-radius: var(--spectrum-corner-radius-100, 4px); background: none; cursor: pointer; }
    [role=tab]:hover { background: var(--spectrum-gray-100); }
    [role=tab]:focus-visible { outline: 2px solid var(--spectrum-focus-indicator-color); outline-offset: -2px; }
    /* Spectrum's tab selection indicator: a bar under the tab chosen. */
    [role=tab][aria-selected=true]::after { content: ""; position: absolute; inset: auto 3px 1px; height: 2px; border-radius: 1px;
        background: var(--spectrum-neutral-content-color-default, var(--spectrum-gray-800)); }
    [role=tab] sp-badge { pointer-events: none; }
    sp-badge[data-state=eligible], sp-badge[data-state=registration] { opacity: 0.7; font-style: italic; }
    sp-badge[data-state=none] { opacity: 0.5; }
    .line { flex: none; border: 0; background: none; padding: 4px 6px; border-radius: var(--spectrum-corner-radius-100, 4px); cursor: pointer;
        color: var(--spectrum-accent-content-color-default); font: var(--spectrum-font-size-75, 12px) var(--guide-code-font, ui-monospace, monospace); }
    .line:hover { text-decoration: underline; }
    .details { margin: 0 var(--spectrum-spacing-100, 8px) var(--spectrum-spacing-200, 12px) calc(var(--spectrum-spacing-100, 8px) + 1.4em); }
    .runs { margin: 0 0 var(--spectrum-spacing-75, 4px); color: var(--spectrum-gray-700); font-size: var(--spectrum-font-size-75, 12px); }
    .note { margin: 0 0 var(--spectrum-spacing-75, 4px); padding: var(--spectrum-spacing-75, 6px) var(--spectrum-spacing-100, 8px);
        border-radius: var(--spectrum-corner-radius-100, 4px); font-size: var(--spectrum-font-size-75, 12px); }
    .note.eligible { color: var(--spectrum-informative-content-color-default, var(--spectrum-gray-800));
        background: color-mix(in srgb, var(--spectrum-informative-background-color-default, blue) 12%, transparent); }
    .note.none, .note.registration { color: var(--spectrum-gray-800); background: var(--spectrum-gray-100); }
    .code { border: 1px solid var(--spectrum-gray-200); border-radius: var(--spectrum-corner-radius-100, 4px); overflow: hidden; }
    .code .cm-editor { max-height: 26em; }
    .code .cm-scroller { overflow: auto; }
    [hidden] { display: none; }
</style>
<p class="stale" role="status" hidden>The latest edit didn't compile: these are from the last build that did.</p>
<p class="empty">No systems.</p>
<div class="files"></div>`;

export class GuideCompiled extends HTMLElement {
    readonly #files: HTMLElement;
    readonly #stale: HTMLElement;
    readonly #empty: HTMLElement;
    #systems: readonly CompiledFile[] = [];
    #opened: OpenedSystem | null = null;
    /** Which systems are expanded, and the backend each shows, by file and name, kept across builds. */
    readonly #expanded = new Set<string>();
    readonly #shownBackend = new Map<string, BackendKey>();
    /** Each code view open, by its system and backend, kept while its code stays the same. */
    #views = new Map<string, { readonly code: string; readonly view: EditorView }>();

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.append(template.content.cloneNode(true));
        const files = root.querySelector(".files");
        const stale = root.querySelector(".stale");
        const empty = root.querySelector(".empty");
        if (!(files instanceof HTMLElement && stale instanceof HTMLElement && empty instanceof HTMLElement)) throw new Error("guide-compiled's template is missing a part.");
        this.#files = files;
        this.#stale = stale;
        this.#empty = empty;
    }

    get systems(): readonly CompiledFile[] {
        return this.#systems;
    }

    set systems(value: readonly CompiledFile[]) {
        if (value === this.#systems) return;
        this.#systems = value;
        this.#render();
    }

    get stale(): boolean {
        return !this.#stale.hidden;
    }

    set stale(value: boolean) {
        this.#stale.hidden = !value;
    }

    get opened(): OpenedSystem | null {
        return this.#opened;
    }

    set opened(value: OpenedSystem | null) {
        const known = value === null || value.serial === this.#opened?.serial;
        this.#opened = value;
        if (known) return;
        const file = this.#systems.find(item => item.file === value.file);
        const system = file?.systems.find(item => item.start === value.start);
        if (file === undefined || system === undefined) return;
        const key = keyOf(file.file, system);
        this.#expanded.add(key);
        this.#shownBackend.set(key, defaultBackend(system));
        this.#render();
        const tab = this.shadowRoot?.querySelector(`[data-key="${CSS.escape(key)}"] [aria-selected=true]`);
        if (tab instanceof HTMLElement) {
            tab.scrollIntoView({ block: "nearest" });
            tab.focus({ preventScroll: true });
        }
    }

    #render(): void {
        const files = this.#systems.filter(file => file.systems.length > 0);
        this.#empty.hidden = files.length > 0;
        const kept = new Map<string, { readonly code: string; readonly view: EditorView }>();
        this.#files.replaceChildren(...files.flatMap(file => {
            const list = document.createElement("ul");
            list.setAttribute("aria-label", `Systems of ${file.file}`);
            list.append(...file.systems.map(system => this.#item(file.file, system, kept)));
            if (this.#systems.length === 1) return [list];
            const heading = document.createElement("h3");
            heading.textContent = file.file;
            return [heading, list];
        }));
        for (const [key, { view }] of this.#views) if (!kept.has(key)) view.destroy();
        this.#views = kept;
        // A view moved into the page measures itself again.
        for (const { view } of kept.values()) view.requestMeasure();
    }

    #item(file: string, system: CompiledSystem, kept: Map<string, { readonly code: string; readonly view: EditorView }>): HTMLElement {
        const key = keyOf(file, system);
        const expanded = this.#expanded.has(key);
        const item = document.createElement("li");
        item.dataset["key"] = key;
        const row = document.createElement("div");
        row.className = "row";
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "toggle";
        toggle.setAttribute("aria-expanded", String(expanded));
        const chevron = document.createElement("span");
        chevron.className = "chevron";
        chevron.setAttribute("aria-hidden", "true");
        chevron.textContent = "›";
        const name = document.createElement("span");
        name.className = "name";
        name.textContent = nameOf(system);
        const meta = document.createElement("span");
        meta.className = "meta";
        meta.textContent = `${system.kind}${kernelWords(system)}`;
        const written = document.createElement("sp-badge");
        written.setAttribute("size", "s");
        written.setAttribute("variant", "neutral");
        written.dataset["state"] = "written";
        written.textContent = "as written";
        const compiled = backends.some(backend => system[backend.key].kind === "compiled");
        toggle.append(chevron, name, meta, ...compiled ? [] : [written]);
        toggle.setAttribute("aria-label", `${nameOf(system)}, ${system.kind}${kernelWords(system).replace(" · ", ", ")}${compiled ? "" : ", as written"}`);
        toggle.addEventListener("click", () => {
            if (this.#expanded.has(key)) this.#expanded.delete(key);
            else this.#expanded.add(key);
            this.#render();
            this.#focus(key, ".toggle");
        });
        const place = `${this.#systems.findIndex(item => item.file === file)}-${system.start}`;
        const shown = this.#shownBackend.get(key) ?? defaultBackend(system);
        // A tab per backend, which is its badge: choosing one expands the row at it.
        const tablist = document.createElement("div");
        tablist.setAttribute("role", "tablist");
        tablist.setAttribute("aria-label", `What ${nameOf(system)} compiles to`);
        const choose = (backend: BackendKey): void => {
            this.#expanded.add(key);
            this.#shownBackend.set(key, backend);
            this.#render();
            this.#focus(key, `[data-backend=${backend}]`);
        };
        for (const backend of backends) {
            const state = system[backend.key].kind;
            const tab = document.createElement("button");
            tab.type = "button";
            tab.setAttribute("role", "tab");
            tab.id = `tab-${place}-${backend.key}`;
            tab.dataset["backend"] = backend.key;
            const selected = expanded && backend.key === shown;
            tab.setAttribute("aria-selected", String(selected));
            if (expanded) tab.setAttribute("aria-controls", `panel-${place}`);
            tab.tabIndex = backend.key === shown ? 0 : -1;
            tab.setAttribute("aria-label", `${backend.label}, ${stateWords[state]}`);
            const badge = document.createElement("sp-badge");
            badge.setAttribute("size", "s");
            badge.setAttribute("variant", states[state]);
            badge.dataset["state"] = state;
            badge.textContent = backend.label;
            tab.append(badge);
            tab.addEventListener("click", () => choose(backend.key));
            tab.addEventListener("keydown", event => {
                const at = backends.findIndex(item => item.key === backend.key);
                const next = event.key === "ArrowRight" ? backends[(at + 1) % backends.length] : event.key === "ArrowLeft" ? backends[(at + backends.length - 1) % backends.length]
                    : event.key === "Home" ? backends[0] : event.key === "End" ? backends[backends.length - 1] : undefined;
                if (next === undefined) return;
                event.preventDefault();
                // Arrows select within an expanded row, and move between the badges of a collapsed one.
                if (expanded) choose(next.key);
                else {
                    this.#shownBackend.set(key, next.key);
                    this.#render();
                    this.#focus(key, `[data-backend=${next.key}]`);
                }
            });
            tablist.append(tab);
        }
        const line = document.createElement("button");
        line.type = "button";
        line.className = "line";
        line.textContent = `line ${system.line}`;
        line.setAttribute("aria-label", `Show ${nameOf(system)} in the editor, at line ${system.line}`);
        line.addEventListener("click", () => this.dispatchEvent(new CustomEvent("guide-locate", { detail: { file, line: system.line, column: system.column }, bubbles: true, composed: true })));
        row.append(toggle, tablist, line);
        item.append(row);
        if (!expanded) return item;
        const details = document.createElement("div");
        details.className = "details";
        details.id = `details-${place}`;
        toggle.setAttribute("aria-controls", details.id);
        const runs = document.createElement("p");
        runs.className = "runs";
        runs.textContent = system.runs;
        const panel = document.createElement("div");
        panel.setAttribute("role", "tabpanel");
        panel.id = `panel-${place}`;
        panel.setAttribute("aria-labelledby", `tab-${place}-${shown}`);
        const backend = system[shown];
        if (backend.kind !== "compiled") {
            const note = document.createElement("p");
            note.className = `note ${backend.kind}`;
            note.textContent = backend.reason;
            panel.append(note);
        }
        if (backend.kind === "compiled" || backend.kind === "eligible") {
            const code = document.createElement("div");
            code.className = "code";
            const viewKey = `${key}:${shown}`;
            const existing = this.#views.get(viewKey);
            const view = existing !== undefined && existing.code === backend.code ? existing.view : this.#view(backend.code, shown);
            code.append(view.dom);
            kept.set(viewKey, { code: backend.code, view });
            panel.append(code);
        }
        details.append(runs, panel);
        item.append(details);
        return item;
    }

    /** Focuses a part of a system's row, after it's drawn again. */
    #focus(key: string, selector: string): void {
        const found = this.shadowRoot?.querySelector(`[data-key="${CSS.escape(key)}"] ${selector}`);
        if (found instanceof HTMLElement) found.focus();
    }

    /** A read-only view of code, highlighted for its backend. */
    #view(code: string, backend: BackendKey): EditorView {
        const language = backends.find(item => item.key === backend)?.language() ?? wat;
        return new EditorView({
            root: this.shadowRoot ?? document,
            state: EditorState.create({
                doc: code,
                extensions: [lineNumbers(), language, syntaxHighlighting(codeHighlight), codeTheme, EditorView.lineWrapping, EditorState.readOnly.of(true), EditorView.editable.of(false), EditorState.tabSize.of(4)],
            }),
        });
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "guide-compiled": GuideCompiled;
    }
}
