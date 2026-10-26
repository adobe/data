// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Facet, MapMode, StateEffect, StateField, type EditorState, type Extension, type Transaction } from "@codemirror/state";
import { Decoration, EditorView, showTooltip, WidgetType, type DecorationSet, type Tooltip } from "@codemirror/view";

/**
 * Marks at each system of the file in an editor: a lens above its call's first line, at its indentation, saying what it
 * compiles to, whose chip shows a tooltip of what runs it and why a backend gives nothing, as it's hovered or focused, and opens it as
 * it's chosen. The marks move with edits until the next build marks them again; stale ones, from a build before an
 * edit that failed to compile, are dimmed.
 */

/** What a backend gives a system: code, code it would give, code made at registration, or none; and why. */
export type MarkedBackend = { readonly kind: "compiled" | "eligible" | "registration" | "none"; readonly reason?: string };

/** A system as the editor marks it: where its call starts, counted from 1, and what each backend gives it. */
export type MarkedSystem = {
    readonly start: number;
    readonly line: number;
    readonly column: number;
    readonly binding: string | null;
    readonly runs: string;
    readonly js: MarkedBackend;
    readonly wasm: MarkedBackend;
    readonly wgsl: MarkedBackend;
};

/** What choosing a system's mark does, by its call's start. */
export const openSystem = Facet.define<(start: number) => void, (start: number) => void>({ combine: values => values[0] ?? (() => {}) });

/** Marks the systems, and whether they're from a build before the latest edit. */
export const setMarks = StateEffect.define<{ readonly systems: readonly MarkedSystem[]; readonly stale: boolean }>();
/** Shows the tooltip of the system at a position, or none. */
const setTip = StateEffect.define<{ readonly system: MarkedSystem; readonly at: number } | null>();

const backends = [["JS", "js"], ["WASM", "wasm"], ["WGSL", "wgsl"]] as const;

/** A lens's height in pixels: its chip's line, 17px, its border and the space above it, as its style lays it out. */
const lensHeight = 21;

/** A system's name: its binding, or its line. */
const nameOf = (system: MarkedSystem): string => system.binding ?? `line ${system.line}`;

/** What a backend's state means, as the tooltip and labels say it. */
const stateWords = { compiled: "compiled", eligible: "if declared kernel: \"gpu\"", registration: "made at registration", none: "not compiled" } as const;

/** A system's mark as text for assistive technology: what each backend gives it. */
const describeMark = (system: MarkedSystem): string => {
    const parts = backends.map(([label, key]) => `${label} ${stateWords[system[key].kind]}`);
    return `${nameOf(system)}: ${parts.join(", ")}. Show what it compiles to.`;
};

/** The backends a chip names, and how: the ones giving code, or that would; none of them compiled says it runs as written. */
const chipParts = (system: MarkedSystem): readonly { readonly text: string; readonly kind: MarkedBackend["kind"] | "written" }[] => {
    const given = backends.flatMap(([label, key]) => system[key].kind === "none" ? [] : [{ text: label, kind: system[key].kind }]);
    return given.some(part => part.kind === "compiled") ? given : [{ text: "as written", kind: "written" }, ...given];
};

/** The lens each lens element shows now: updating one in place keeps its element, and the height the editor measured. */
const shownBy = new WeakMap<HTMLElement, Lens>();

class Lens extends WidgetType {
    constructor(readonly system: MarkedSystem, readonly stale: boolean, readonly indent: number) {
        super();
    }

    override eq(other: Lens): boolean {
        return other.stale === this.stale && other.indent === this.indent && JSON.stringify(other.system) === JSON.stringify(this.system);
    }

    /** A lens is one line of chip, which the editor counts before it measures it, so no line under the pointer moves then. */
    override get estimatedHeight(): number {
        return lensHeight;
    }

    override toDOM(view: EditorView): HTMLElement {
        const lens = document.createElement("div");
        lens.className = "cm-system-lens";
        const button = document.createElement("button");
        button.type = "button";
        const system = (): MarkedSystem | undefined => shownBy.get(lens)?.system;
        const show = (): void => {
            const shown = system();
            if (shown !== undefined) view.dispatch({ effects: setTip.of({ system: shown, at: view.posAtDOM(button) }) });
        };
        const hide = (): void => view.dispatch({ effects: setTip.of(null) });
        button.addEventListener("mouseenter", show);
        button.addEventListener("focus", show);
        button.addEventListener("mouseleave", hide);
        button.addEventListener("blur", hide);
        button.addEventListener("click", () => {
            const shown = system();
            if (shown !== undefined) view.state.facet(openSystem)(shown.start);
        });
        lens.append(button);
        this.#fill(lens);
        return lens;
    }

    /** Shows this lens in a lens element already drawn, as a build changes what it says, keeping the element. */
    override updateDOM(dom: HTMLElement): boolean {
        if (!dom.classList.contains("cm-system-lens")) return false;
        this.#fill(dom);
        return true;
    }

    #fill(lens: HTMLElement): void {
        shownBy.set(lens, this);
        lens.style.paddingInlineStart = `${this.indent}ch`;
        const button = lens.querySelector("button");
        if (button === null) return;
        button.className = `cm-system-chip${this.stale ? " cm-system-stale" : ""}`;
        button.dataset["start"] = String(this.system.start);
        button.setAttribute("aria-label", describeMark(this.system));
        button.replaceChildren(...chipParts(this.system).flatMap((part, index) => {
            const span = document.createElement("span");
            span.className = `cm-system-${part.kind}`;
            span.textContent = part.text;
            return index > 0 ? [document.createTextNode(" · "), span] : [span];
        }));
    }

    // The chip's own events are its button's, not the editor's.
    override ignoreEvent(): boolean {
        return true;
    }
}

/** The tooltip of a system: what runs it, then each backend's state and why it gives nothing. */
const tooltipOf = (system: MarkedSystem, at: number): Tooltip => ({
    pos: at,
    above: false,
    create: () => {
        const dom = document.createElement("div");
        dom.className = "cm-system-tip";
        dom.setAttribute("role", "tooltip");
        const title = document.createElement("strong");
        title.textContent = nameOf(system);
        const runs = document.createElement("p");
        runs.textContent = system.runs;
        const list = document.createElement("ul");
        for (const [label, key] of backends) {
            const backend = system[key];
            const item = document.createElement("li");
            item.className = `cm-system-${backend.kind}`;
            const name = document.createElement("b");
            name.textContent = `${label}: ${stateWords[backend.kind]}`;
            item.append(name);
            if (backend.reason !== undefined) item.append(document.createTextNode(` — ${backend.reason}`));
            list.append(item);
        }
        dom.append(title, runs, list);
        return { dom };
    },
});

/** A lens's system and the line it stands above now, as edits since its build have moved it. */
type Placed = { readonly system: MarkedSystem; readonly line: number };

/** Each system's lens, above its line, at its indentation, in the document as it is now. */
const chipsOf = (state: EditorState, placed: readonly Placed[], stale: boolean): DecorationSet => {
    const { doc } = state;
    const lenses = placed.flatMap(({ system, line: number }) => {
        if (number < 1 || number > doc.lines) return [];
        const line = doc.line(number);
        const indent = /^\s*/.exec(line.text)?.[0].replace(/\t/g, "    ").length ?? 0;
        return [Decoration.widget({ widget: new Lens(system, stale, indent), block: true, side: -1 }).range(line.from)];
    });
    return Decoration.set(lenses, true);
};

/**
 * The lenses' lines after an edit: each follows its line where the edit kept it, and stays at its line's number where
 * the edit replaced it, as replacing the whole text does, so the lines don't move until the build places them again.
 */
const moved = (placed: readonly Placed[], transaction: Transaction): readonly Placed[] => placed.map(({ system, line }) => {
    const before = transaction.startState.doc;
    if (line < 1 || line > before.lines) return { system, line };
    const at = transaction.changes.mapPos(before.line(line).from, 1, MapMode.TrackDel);
    return { system, line: at === null ? Math.min(line, transaction.newDoc.lines) : transaction.newDoc.lineAt(at).number };
});

const marks = StateField.define<{ readonly placed: readonly Placed[]; readonly stale: boolean; readonly chips: DecorationSet; readonly tip: Tooltip | null }>({
    create: () => ({ placed: [], stale: false, chips: Decoration.none, tip: null }),
    update: (value, transaction) => {
        let { placed, stale, chips, tip } = value;
        if (transaction.docChanged) {
            placed = moved(placed, transaction);
            chips = chipsOf(transaction.state, placed, stale);
            tip = null;
        }
        for (const effect of transaction.effects) {
            if (effect.is(setMarks)) {
                placed = effect.value.systems.map(system => ({ system, line: system.line }));
                stale = effect.value.stale;
                chips = chipsOf(transaction.state, placed, stale);
                tip = null;
            }
            if (effect.is(setTip)) tip = effect.value === null ? null : tooltipOf(effect.value.system, effect.value.at);
        }
        return chips === value.chips && tip === value.tip ? value : { placed, stale, chips, tip };
    },
    provide: field => [EditorView.decorations.from(field, value => value.chips), showTooltip.from(field, value => value.tip)],
});

const style = EditorView.theme({
    ".cm-system-lens": { boxSizing: "border-box", height: `${lensHeight}px`, padding: "2px 0 0 6px", lineHeight: "17px", whiteSpace: "nowrap" },
    ".cm-system-chip": {
        padding: "0 8px", border: "1px solid var(--spectrum-gray-300)", borderRadius: "var(--spectrum-corner-radius-full, 9px)",
        background: "var(--spectrum-gray-100)", color: "var(--spectrum-gray-800)", font: "600 var(--spectrum-font-size-50, 11px)/17px var(--spectrum-sans-font-family-stack, system-ui, sans-serif)",
        cursor: "pointer", verticalAlign: "1px",
    },
    ".cm-system-chip:hover": { background: "var(--spectrum-gray-200)" },
    ".cm-system-chip:focus-visible": { outline: "2px solid var(--spectrum-focus-indicator-color)", outlineOffset: "1px" },
    ".cm-system-chip .cm-system-compiled": { color: "var(--spectrum-positive-content-color-default, var(--spectrum-green-900))" },
    ".cm-system-chip .cm-system-eligible, .cm-system-chip .cm-system-registration": { color: "var(--spectrum-gray-600)", fontWeight: "400", fontStyle: "italic" },
    ".cm-system-chip .cm-system-written": { color: "var(--spectrum-gray-700)", fontWeight: "400" },
    ".cm-system-stale": { opacity: "0.55" },
    ".cm-tooltip.cm-system-tip": {
        border: "1px solid var(--spectrum-gray-300)", borderRadius: "var(--spectrum-corner-radius-100, 4px)", backgroundColor: "var(--spectrum-background-layer-2-color, var(--spectrum-gray-75))",
        boxShadow: "var(--guide-elevation, 0 2px 8px rgba(0, 0, 0, 0.3))",
        maxWidth: "min(420px, 90vw)", padding: "8px 10px", color: "var(--spectrum-gray-800)",
        font: "var(--spectrum-font-size-75, 12px)/1.45 var(--spectrum-sans-font-family-stack, system-ui, sans-serif)",
    },
    ".cm-system-tip p": { margin: "4px 0 6px" },
    ".cm-system-tip ul": { margin: "0", padding: "0", listStyle: "none" },
    ".cm-system-tip li + li": { marginTop: "3px" },
    ".cm-system-tip li.cm-system-compiled b": { color: "var(--spectrum-positive-content-color-default, var(--spectrum-green-900))" },
    ".cm-system-tip li.cm-system-none b, .cm-system-tip li.cm-system-eligible b, .cm-system-tip li.cm-system-registration b": { color: "var(--spectrum-gray-700)" },
});

/** The marks' state and look. */
export const systemMarks: Extension = [marks, style];
