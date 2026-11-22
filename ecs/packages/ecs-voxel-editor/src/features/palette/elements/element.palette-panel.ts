// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { PaletteSection } from "./type.palette-section.js";

/**
 * `<palette-panel>`: what to fill with, in `sections`, each item a material's swatch or a model's thumbnail, drawn by its
 * `draw` and turning while the pointer rests on it, or a library file's saved image; with filters by kind, size and name. It dispatches `palette-pick`, `palette-favorite`, `palette-edit` (a
 * model double-clicked) and `palette-open` (a library file's open button) with an item's key; `palette-filter` with the
 * filters.
 */
export class PalettePanel extends HTMLElement {
    #sections: readonly PaletteSection[] = [];
    #signature = "";
    #spinning: { readonly canvas: HTMLCanvasElement; readonly draw: (canvas: HTMLCanvasElement, angle: number) => void; frame: number; start: number } | null = null;
    readonly #list: HTMLElement;
    readonly #filters: { readonly kind: HTMLSelectElement; readonly size: HTMLSelectElement; readonly search: HTMLInputElement };

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.append(template.content.cloneNode(true));
        const part = <E extends Element>(selector: string, kind: abstract new () => E): E => {
            const found = root.querySelector(selector);
            if (!(found instanceof kind)) throw new Error(`palette-panel's template has no ${selector}.`);
            return found;
        };
        this.#list = part(".sections", HTMLElement);
        this.#filters = { kind: part(".kind", HTMLSelectElement), size: part(".size", HTMLSelectElement), search: part(".search", HTMLInputElement) };
        const filter = (): void => {
            const { kind, size, search } = this.#filters;
            this.#dispatch("palette-filter", { kind: kind.value, size: size.value, search: search.value });
        };
        for (const each of Object.values(this.#filters)) each.addEventListener("input", filter);
        this.#list.addEventListener("click", event => {
            const target = event.target instanceof Element ? event.target : null;
            const item = target?.closest<HTMLElement>("[data-key]");
            const key = item?.dataset["key"];
            if (key === undefined) return;
            if (target?.closest(".heart") !== null) this.#dispatch("palette-favorite", { key });
            else if (target?.closest(".open") !== null) this.#dispatch("palette-open", { key });
            else this.#dispatch("palette-pick", { key });
        });
        this.#list.addEventListener("dblclick", event => {
            const key = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-key]")?.dataset["key"] : undefined;
            if (key?.startsWith("model:") === true) this.#dispatch("palette-edit", { key });
        });
        this.#list.addEventListener("pointerover", event => this.#hover(event.target instanceof Element ? event.target.closest<HTMLElement>("[data-key]") : null));
        this.#list.addEventListener("pointerleave", () => this.#hover(null));
    }

    set sections(value: readonly PaletteSection[]) {
        this.#sections = value;
        const signature = JSON.stringify(value.map(section => [section.title, section.items.map(item => [item.key, item.label, item.folder, item.color, item.image?.length, item.version, item.selected, item.favorite])]));
        if (signature === this.#signature) return;
        this.#signature = signature;
        this.#render();
    }

    #render(): void {
        this.#hover(null);
        this.#list.replaceChildren(...this.#sections.filter(section => section.items.length > 0).map(section => {
            const block = document.createElement("section");
            block.append(Object.assign(document.createElement("h3"), { textContent: section.title }));
            let folder: string | null = null;
            const grid = document.createElement("div");
            grid.className = "grid";
            for (const item of section.items) {
                if (item.folder !== undefined && item.folder !== folder) {
                    folder = item.folder;
                    grid.append(Object.assign(document.createElement("div"), { className: "folder", textContent: folder === "" ? "/" : `${folder}/` }));
                }
                const button = document.createElement("div");
                button.className = "item";
                button.dataset["key"] = item.key;
                button.title = item.label;
                button.setAttribute("aria-pressed", String(item.selected));
                const picture = document.createElement("div");
                picture.className = "picture";
                if (item.color !== undefined) picture.style.background = item.color;
                if (item.image !== undefined) picture.append(Object.assign(document.createElement("img"), { src: item.image, alt: "" }));
                if (item.draw !== undefined) {
                    const canvas = Object.assign(document.createElement("canvas"), { width: 96, height: 96 });
                    item.draw(canvas, rest);
                    picture.append(canvas);
                }
                const heart = Object.assign(document.createElement("button"), { className: "heart", title: item.favorite ? "Unfavorite" : "Favorite", innerHTML: heartIcon });
                heart.setAttribute("aria-pressed", String(item.favorite));
                heart.setAttribute("aria-label", heart.title);
                picture.append(heart);
                button.append(picture, Object.assign(document.createElement("span"), { className: "label", textContent: item.label }));
                if (item.key.startsWith("file:")) button.append(Object.assign(document.createElement("button"), { className: "open", textContent: "Open", title: "Open as the document" }));
                grid.append(button);
            }
            block.append(grid);
            return block;
        }));
    }

    /** Turns the thumbnail of the item under the pointer, putting the last one back at rest. */
    #hover(element: HTMLElement | null): void {
        const canvas = element?.querySelector("canvas") ?? null;
        if (this.#spinning !== null && this.#spinning.canvas === canvas) return;
        if (this.#spinning !== null) {
            cancelAnimationFrame(this.#spinning.frame);
            this.#spinning.draw(this.#spinning.canvas, rest);
            this.#spinning = null;
        }
        const key = element?.dataset["key"];
        const draw = this.#sections.flatMap(section => section.items).find(item => item.key === key)?.draw;
        if (canvas === null || draw === undefined) return;
        const spinning = { canvas, draw, frame: 0, start: performance.now() };
        const turn = (now: number): void => {
            draw(canvas, rest + (now - spinning.start) / 1000 * 1.5);
            spinning.frame = requestAnimationFrame(turn);
        };
        spinning.frame = requestAnimationFrame(turn);
        this.#spinning = spinning;
    }

    #dispatch(type: string, detail: unknown): void {
        this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
    }
}

/** A heart's outline, which a favorite's fills. */
const heartIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path stroke-linejoin="round" d="M12 20.5s-7.5-4.6-9.2-9.3C1.6 7.8 3.9 4.5 7.3 4.5c2 0 3.6 1.1 4.7 2.7 1.1-1.6 2.7-2.7 4.7-2.7 3.4 0 5.7 3.3 4.5 6.7-1.7 4.7-9.2 9.3-9.2 9.3z"/></svg>`;

/** The angle a thumbnail rests at. */
const rest = Math.PI / 5;

const template = document.createElement("template");
template.innerHTML = `
<style>
    :host { display: flex; flex-direction: column; gap: 8px; min-height: 0; font-size: 12px; }
    .filters { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
    .filters .search { grid-column: 1 / -1; }
    select, input { font: inherit; color: inherit; background: rgb(255 255 255 / 0.06); border: 1px solid rgb(255 255 255 / 0.15); border-radius: 4px; padding: 3px 5px; min-width: 0; }
    .sections { overflow: auto; display: flex; flex-direction: column; gap: 10px; min-height: 0; flex: 1; }
    h3 { margin: 0 0 4px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #9ca3af; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); gap: 4px; }
    .folder { grid-column: 1 / -1; color: #9ca3af; font-size: 11px; margin-top: 2px; }
    .item { position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 4px; border: 1px solid transparent; border-radius: 6px; cursor: pointer; }
    .item:hover { background: rgb(255 255 255 / 0.06); }
    .item[aria-pressed="true"] { border-color: var(--editor-accent, #3b82f6); background: rgb(255 255 255 / 0.08); }
    .picture { width: 48px; height: 48px; border-radius: 6px; box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.3); display: grid; place-items: center; overflow: hidden; }
    .picture img, .picture canvas { width: 48px; height: 48px; }
    .label { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: capitalize; }
    .picture { position: relative; }
    /* Docked in the picture's top right, shown as the pointer rests on the item: filled for a favorite, an outline else. */
    .heart { position: absolute; top: 2px; right: 2px; display: grid; place-items: center; width: 20px; height: 20px; padding: 0;
        color: #fff; background: rgb(0 0 0 / 0.35); border: 0; border-radius: 50%; cursor: pointer; opacity: 0; transition: opacity 0.1s; }
    .heart svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; }
    .heart[aria-pressed="true"] svg { fill: currentColor; }
    .item:hover .heart, .heart:focus-visible { opacity: 1; }
    .heart:hover { background: rgb(0 0 0 / 0.55); }
    .open { font: inherit; font-size: 10px; color: inherit; background: rgb(255 255 255 / 0.08); border: 0; border-radius: 3px; padding: 1px 4px; cursor: pointer; }
</style>
<div class="filters">
    <select class="kind" aria-label="Kind"><option value="all">All</option><option value="materials">Materials</option><option value="models">Models</option></select>
    <select class="size" aria-label="Model size"><option value="any">Any size</option><option value="small">Small ≤ 8</option><option value="medium">Medium ≤ 32</option><option value="large">Large</option></select>
    <input class="search" type="search" placeholder="Search" aria-label="Search">
</div>
<div class="sections"></div>
`;

type PalettePanelEvents = {
    readonly "palette-pick": CustomEvent<{ readonly key: string }>;
    readonly "palette-favorite": CustomEvent<{ readonly key: string }>;
    readonly "palette-edit": CustomEvent<{ readonly key: string }>;
    readonly "palette-open": CustomEvent<{ readonly key: string }>;
    readonly "palette-filter": CustomEvent<{ readonly kind: string; readonly size: string; readonly search: string }>;
};

declare global {
    interface HTMLElementTagNameMap {
        "palette-panel": PalettePanel;
    }
    interface HTMLElementEventMap extends PalettePanelEvents {}
}
