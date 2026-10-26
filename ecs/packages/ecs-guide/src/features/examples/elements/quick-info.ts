// © 2026 Adobe. MIT License. See /LICENSE for details.
import { forEachDiagnostic } from "@codemirror/lint";
import { Facet, StateEffect, StateField, type Extension } from "@codemirror/state";
import { closeHoverTooltips, EditorView, hoverTooltip, keymap, showTooltip, ViewPlugin, type Tooltip, type ViewUpdate } from "@codemirror/view";
import { marked } from "marked";

/**
 * What's under the pointer, or at the cursor, in the editor, as TypeScript says: a tooltip of its signature,
 * highlighted as the editor highlights code, and its TSDoc, rendered. Hovering asks once the pointer rests, as
 * CodeMirror's hover tooltips do; Ctrl or Cmd+K, then Ctrl or Cmd+I, shows it at the cursor, with any problem there,
 * until the cursor moves or Escape.
 */

/** A run of text TypeScript describes, by its kind. */
export type InfoPart = { readonly text: string; readonly kind: string };

/** What's at a place: its span, its signature, its documentation and its TSDoc tags. */
export type HoverInfo = {
    readonly start: number; readonly length: number;
    readonly display: readonly InfoPart[]; readonly documentation: readonly InfoPart[];
    readonly tags: readonly { readonly name: string; readonly text: readonly InfoPart[] }[];
};

/** Asks what's at a position in the editor's document as it is now, or null for nothing. */
export const infoSource = Facet.define<(position: number) => Promise<HoverInfo | null>, (position: number) => Promise<HoverInfo | null>>({
    combine: values => values[0] ?? (async () => null),
});

/** The class each part of a signature is highlighted with, by its kind, as the editor's tokens are. */
const partClasses: { readonly [kind: string]: string } = {
    keyword: "keyword", className: "type", interfaceName: "type", aliasName: "type", typeParameterName: "type", enumName: "type", moduleName: "type",
    functionName: "function", methodName: "function", parameterName: "property", propertyName: "property", localName: "variable",
    stringLiteral: "string", numericLiteral: "number", operator: "punctuation", punctuation: "punctuation",
};

/** A signature's parts as code, each highlighted by its kind. */
const signatureOf = (parts: readonly InfoPart[]): HTMLElement => {
    const code = document.createElement("pre");
    code.className = "cm-quick-signature";
    for (const part of parts) {
        const kind = partClasses[part.kind];
        if (kind === undefined) {
            code.append(part.text);
            continue;
        }
        const span = document.createElement("span");
        span.className = `cm-quick-${kind}`;
        span.textContent = part.text;
        code.append(span);
    }
    return code;
};

/** Documentation's parts as markdown: a `{@link}` becomes its text, or its target as code. */
const markdownOf = (parts: readonly InfoPart[]): string => {
    let text = "";
    /** While inside a `{@link}`: what it reads as so far. */
    let linked: string | null = null;
    for (const part of parts) {
        if (part.kind === "link") {
            if (part.text.startsWith("{@")) linked = "";
            else {
                text += linked ?? "";
                linked = null;
            }
        }
        else if (linked !== null) linked = part.kind === "linkName" ? `\`${part.text}\`` : part.kind === "linkText" ? part.text : `${linked}${part.text}`;
        else text += part.text;
    }
    return text + (linked ?? "");
};

/** Elements and attributes rendered documentation keeps: text and its formatting, and links to the web. */
const kept = new Set(["P", "UL", "OL", "LI", "CODE", "PRE", "EM", "STRONG", "A", "BR", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "H5", "H6", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "DEL", "HR"]);

/** Markdown rendered, keeping only what `kept` lists: documentation is text, never script. */
const rendered = (markdown: string): DocumentFragment => {
    const template = document.createElement("template");
    template.innerHTML = String(marked.parse(markdown, { async: false, gfm: true }));
    const clean = (node: Element): void => {
        for (const child of [...node.children]) {
            if (!kept.has(child.tagName)) {
                child.replaceWith(document.createTextNode(child.textContent ?? ""));
                continue;
            }
            for (const attribute of [...child.attributes]) {
                const allowed = child.tagName === "A" && attribute.name === "href" && /^(https?:|#)/i.test(attribute.value);
                if (!allowed) child.removeAttribute(attribute.name);
            }
            if (child.tagName === "A") child.setAttribute("target", "_blank");
            clean(child);
        }
    };
    const root = document.createElement("div");
    root.append(template.content);
    clean(root);
    const fragment = document.createDocumentFragment();
    fragment.append(...root.childNodes);
    return fragment;
};

/** A TSDoc tag as a compact section: parameters by name, what it returns, an example as code, and the rest by name. */
const tagOf = (tag: HoverInfo["tags"][number]): { readonly section: string; readonly markdown: string } => {
    const text = markdownOf(tag.text).trim();
    switch (tag.name) {
        case "param": case "typeParam": {
            const [name, ...rest] = tag.text;
            const description = markdownOf(rest).trim().replace(/^[-–—]\s*/, "");
            return { section: tag.name === "param" ? "Parameters" : "Type parameters", markdown: `- \`${name?.text ?? ""}\`${description === "" ? "" : ` — ${description}`}` };
        }
        case "returns": case "return": return { section: "Returns", markdown: text };
        case "example": return { section: "Example", markdown: text.includes("```") ? text : `\`\`\`ts\n${text}\n\`\`\`` };
        default: return { section: `@${tag.name}`, markdown: text };
    }
};

/** The tooltip's content: the signature, the documentation, then its tags' sections. */
export const infoView = (info: HoverInfo): HTMLElement => {
    const dom = document.createElement("div");
    dom.className = "cm-quick-info";
    dom.setAttribute("role", "tooltip");
    dom.append(signatureOf(info.display));
    const documentation = markdownOf(info.documentation).trim();
    if (documentation !== "") {
        const docs = document.createElement("div");
        docs.className = "cm-quick-doc";
        docs.append(rendered(documentation));
        dom.append(docs);
    }
    const sections = new Map<string, string[]>();
    for (const tag of info.tags) {
        const { section, markdown } = tagOf(tag);
        sections.set(section, [...sections.get(section) ?? [], markdown]);
    }
    for (const [section, items] of sections) {
        const part = document.createElement("section");
        part.className = "cm-quick-tag";
        const heading = document.createElement("h4");
        heading.textContent = section;
        part.append(heading, rendered(items.join("\n")));
        dom.append(part);
    }
    return dom;
};

/** The problems at a position, as the lint tooltip lists them, for the keyboard's tooltip. */
const problemsAt = (view: EditorView, position: number): HTMLElement | null => {
    const list = document.createElement("ul");
    list.className = "cm-tooltip-lint cm-quick-problems";
    forEachDiagnostic(view.state, (diagnostic, from, to) => {
        if (position < from || position > to) return;
        const item = document.createElement("li");
        item.className = `cm-diagnostic cm-diagnostic-${diagnostic.severity}`;
        const text = document.createElement("span");
        text.className = "cm-diagnosticText";
        text.append(diagnostic.renderMessage?.(view) ?? diagnostic.message);
        item.append(text);
        list.append(item);
    });
    return list.childElementCount === 0 ? null : list;
};

/**
 * Says what's marked changed where it can move or hide what a resting pointer hovers: problems marked again, which hide
 * their tooltip, or lenses added or removed, which move lines from under the pointer.
 */
export const rehover = StateEffect.define<null>();

/**
 * Hovers again where the pointer rests once what's under it changes without it moving: when `rehover` says the marks
 * changed, or the lines' heights or the editor's scroll changed so another place is under the pointer, as a lens drawn
 * or measured moves the lines below it, or a scroll moves them all. The hover tooltips open close, and the pointer moves where it is, so what's under it in the new
 * layout opens once it has rested, as though it had moved there. No tooltip is left describing what moved away, nor one
 * missing, whichever answer arrived first.
 */
const rehovering = ViewPlugin.fromClass(class {
    /** Where the page's pointer last moved over the editor, and the place in the document it was over then. */
    pointer: { readonly x: number; readonly y: number; readonly at: number | null } | null = null;
    readonly moved = (event: MouseEvent): void => {
        // Only a pointer the page moved, not the moves this sends.
        if (event.isTrusted) this.pointer = { x: event.clientX, y: event.clientY, at: this.view.posAtCoords({ x: event.clientX, y: event.clientY }) };
    };
    readonly left = (): void => {
        this.pointer = null;
    };
    /** A scroll moves what's under a resting pointer as much as a change does. */
    readonly scrolled = (): void => this.check(false);
    constructor(readonly view: EditorView) {
        view.dom.addEventListener("mousemove", this.moved);
        view.dom.addEventListener("mouseleave", this.left);
        view.scrollDOM.addEventListener("scroll", this.scrolled, { passive: true });
    }
    update(update: ViewUpdate): void {
        const marked = update.transactions.some(transaction => transaction.effects.some(effect => effect.is(rehover)));
        if (marked || update.heightChanged || update.geometryChanged || update.viewportChanged) this.check(marked);
    }
    /** After the editor is drawn and measured, hovers again at the pointer's place, if it's another or the marks changed. */
    check(marked: boolean): void {
        if (this.pointer === null) return;
        requestAnimationFrame(() => {
            const pointer = this.pointer;
            if (pointer === null) return;
            const at = this.view.posAtCoords({ x: pointer.x, y: pointer.y });
            if (!marked && at === pointer.at) return;
            this.pointer = { ...pointer, at };
            this.view.dispatch({ effects: closeHoverTooltips });
            const root = this.view.root;
            const target = "elementFromPoint" in root ? root.elementFromPoint(pointer.x, pointer.y) : null;
            if (target === null || !this.view.dom.contains(target)) return;
            target.dispatchEvent(new MouseEvent("mousemove", { clientX: pointer.x, clientY: pointer.y, bubbles: true, composed: true }));
        });
    }
    destroy(): void {
        this.view.dom.removeEventListener("mousemove", this.moved);
        this.view.dom.removeEventListener("mouseleave", this.left);
        this.view.scrollDOM.removeEventListener("scroll", this.scrolled);
    }
});

/** Shows the keyboard's tooltip, or hides it. */
const setShown = StateEffect.define<Tooltip | null>();

const shown = StateField.define<Tooltip | null>({
    create: () => null,
    update: (value, transaction) => {
        for (const effect of transaction.effects) if (effect.is(setShown)) return effect.value;
        return transaction.docChanged || transaction.selection !== undefined ? null : value;
    },
    provide: field => showTooltip.from(field),
});

/** Shows what's at the cursor, with any problem there, as hovering it would. */
const showAtCursor = (view: EditorView): boolean => {
    const position = view.state.selection.main.head;
    void view.state.facet(infoSource)(position).then(info => {
        if (view.state.selection.main.head !== position) return;
        const problems = problemsAt(view, position);
        if (info === null && problems === null) return;
        const tooltip: Tooltip = {
            pos: info?.start ?? position, above: true,
            create: () => {
                const dom = document.createElement("div");
                dom.className = "cm-quick-keyboard";
                if (info !== null) dom.append(infoView(info));
                if (problems !== null) dom.append(problems);
                return { dom };
            },
        };
        view.dispatch({ effects: setShown.of(tooltip) });
    });
    return true;
};

const hideShown = (view: EditorView): boolean => {
    if (view.state.field(shown) === null) return false;
    view.dispatch({ effects: setShown.of(null) });
    return true;
};

const style = EditorView.theme({
    ".cm-quick-info, .cm-quick-keyboard": { maxWidth: "min(560px, 90vw)", maxHeight: "min(360px, 60vh)", overflow: "auto" },
    ".cm-quick-info": { padding: "6px 10px 8px", color: "var(--spectrum-gray-800)" },
    // A long type scrolls on its own, so the documentation under it stays in view.
    ".cm-quick-signature": {
        margin: "0", maxHeight: "12em", overflow: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: "var(--guide-code-text, var(--spectrum-gray-800))",
        font: "var(--spectrum-font-size-75, 12px)/1.5 var(--guide-code-font, ui-monospace, monospace)",
    },
    ".cm-quick-keyword": { color: "var(--guide-code-keyword)" },
    ".cm-quick-type": { color: "var(--guide-code-type)" },
    ".cm-quick-function": { color: "var(--guide-code-function)" },
    ".cm-quick-property": { color: "var(--guide-code-property)" },
    ".cm-quick-string": { color: "var(--guide-code-string)" },
    ".cm-quick-number": { color: "var(--guide-code-number)" },
    ".cm-quick-punctuation": { color: "var(--guide-code-text, var(--spectrum-gray-800))" },
    ".cm-quick-doc, .cm-quick-tag": { marginTop: "6px", paddingTop: "6px", borderTop: "1px solid var(--spectrum-gray-200)" },
    ".cm-quick-doc p, .cm-quick-tag p": { margin: "0 0 4px" },
    ".cm-quick-doc ul, .cm-quick-tag ul": { margin: "0 0 4px", paddingInlineStart: "18px" },
    ".cm-quick-doc code, .cm-quick-tag code": {
        padding: "0 3px", borderRadius: "3px", background: "var(--spectrum-gray-200)", color: "var(--spectrum-gray-900)",
        font: "var(--spectrum-font-size-75, 12px) var(--guide-code-font, ui-monospace, monospace)",
    },
    ".cm-quick-doc pre, .cm-quick-tag pre": { margin: "4px 0", padding: "6px 8px", borderRadius: "4px", background: "var(--spectrum-gray-100)", overflow: "auto" },
    ".cm-quick-doc pre code, .cm-quick-tag pre code": { padding: "0", background: "none" },
    ".cm-quick-doc a": { color: "var(--spectrum-accent-content-color-default)" },
    ".cm-quick-tag h4": { margin: "0 0 2px", fontSize: "var(--spectrum-font-size-50, 11px)", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--spectrum-gray-700)" },
    ".cm-quick-problems": { margin: "0", padding: "0", listStyle: "none", borderTop: "1px solid var(--spectrum-gray-200)" },
});

/** Hovering shows what's there; Ctrl or Cmd+K then I shows what's at the cursor; Escape hides that. */
export const quickInfo: Extension = [
    hoverTooltip(async (view, position) => {
        const info = await view.state.facet(infoSource)(position);
        if (info === null || info.display.length === 0) return null;
        return { pos: info.start, end: info.start + info.length, above: true, create: () => ({ dom: infoView(info) }) };
    }, { hoverTime: 300 }),
    shown,
    rehovering,
    keymap.of([{ key: "Mod-k Mod-i", run: showAtCursor }, { key: "Escape", run: hideShown }]),
    style,
];
