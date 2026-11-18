// © 2026 Adobe. MIT License. See /LICENSE for details.
/**
 * `<virtual-list>`: a scrolling list of `count` items, each `itemHeight` pixels tall, holding in the DOM only the rows
 * near the view: those in it and `overscan` of the screen's height more above and below. `range` names the items it
 * needs, and `virtual-range` is dispatched when scrolling or resizing takes the view near the edge of them; its owner
 * then calls `render` with the keys of those items. A row keeps the key it shows while that key stays in the range, so
 * its content is written once: scrolling takes the rows whose keys left the range and moves them, absolutely
 * positioned, to the keys that entered it. The focused row stays while its owner says where its key is, and when its
 * key goes, the row now at its place takes the focus.
 */
export class VirtualList<K = unknown, E extends HTMLElement = HTMLElement> extends HTMLElement {
    /** Makes a row when no spare one is left. */
    create: (() => E) | null = null;
    /** The rows kept above and below the view, as a fraction of the screen's height. */
    overscan = 0.5;
    #itemHeight = 44;
    #count = 0;
    #range: Range = { start: 0, end: 0 };
    #scrollTop = 0;
    #height = innerHeight;
    #focused: E | null = null;
    readonly #spacer: HTMLElement;
    /** Each row shown, with the key it shows and where. */
    readonly #items = new Map<E, Item<K>>();
    readonly #rows = new Map<K, E>();
    /** Rows out of the DOM, kept for keys to come. */
    readonly #spare: E[] = [];
    /** The keys being rendered, by index: reused by each render. */
    readonly #wanted = new Map<K, number>();
    #start = 0;
    #keys: readonly K[] = [];
    readonly #resized = new ResizeObserver(() => {
        this.#height = Math.min(this.clientHeight || innerHeight, innerHeight);
        this.#measure(true);
    });

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.append(template.content.cloneNode(true));
        const spacer = root.querySelector(".spacer");
        if (!(spacer instanceof HTMLElement)) throw new Error("virtual-list's template has no spacer.");
        this.#spacer = spacer;
        this.#spacer.style.setProperty("--item-height", `${this.#itemHeight}px`);
        this.#range = this.#rangeAround();
        this.addEventListener("scroll", () => {
            this.#scrollTop = this.scrollTop;
            this.#measure();
        }, { passive: true });
        this.addEventListener("focusin", event => {
            this.#focused = this.#rowOf(event.target);
        });
        this.addEventListener("focusout", event => {
            if (this.#rowOf(event.relatedTarget) === null) this.#focused = null;
        });
    }

    connectedCallback(): void {
        this.#resized.observe(this);
    }

    disconnectedCallback(): void {
        this.#resized.unobserve(this);
    }

    /** How many items there are, which sets how far it scrolls. */
    get count(): number {
        return this.#count;
    }

    set count(value: number) {
        if (value === this.#count) return;
        this.#count = value;
        this.#spacer.style.minHeight = `${value * this.#itemHeight}px`;
    }

    /** Each row's height, in pixels: every row is as tall. */
    get itemHeight(): number {
        return this.#itemHeight;
    }

    set itemHeight(value: number) {
        if (value === this.#itemHeight) return;
        this.#itemHeight = value;
        this.#spacer.style.setProperty("--item-height", `${value}px`);
        this.#spacer.style.minHeight = `${this.#count * value}px`;
        for (const [element, item] of this.#items) position(element, item.index, value);
        this.#measure(true);
    }

    /** The items it needs rendered, from `start` up to `end`, which may pass `count`. */
    get range(): Range {
        return this.#range;
    }

    /**
     * Shows the items from `start`, one for each of `keys`. A row showing one of them keeps showing it, moving only if
     * its index changed; the others show the rest, each passed to `bind` once. The focused row, when its key isn't
     * among them, stays at the index `keep` gives for it, or goes for -1, giving the focus to the row at its place.
     */
    render(start: number, keys: readonly K[], bind: (element: E, key: K, index: number) => void, keep?: (element: E, key: K) => number): void {
        if (start === this.#start && this.#focused === null && same(keys, this.#keys)) return;
        this.#start = start;
        this.#keys = keys.slice();
        const wanted = this.#wanted;
        wanted.clear();
        let index = start;
        for (const key of keys) wanted.set(key, index++);
        let refocus = -1;
        for (const [element, item] of this.#items) {
            if (wanted.has(item.key)) continue;
            if (element === this.#focused) {
                const kept = keep?.(element, item.key) ?? -1;
                if (kept >= 0) {
                    this.#place(element, item, kept);
                    continue;
                }
                refocus = item.index;
            }
            this.#items.delete(element);
            this.#rows.delete(item.key);
            // The row that had the focus is reused last, so it doesn't keep it showing another key.
            if (element === this.#focused) this.#spare.unshift(element);
            else this.#spare.push(element);
        }
        index = start;
        for (const key of keys) {
            let element = this.#rows.get(key);
            let item = element === undefined ? undefined : this.#items.get(element);
            if (element === undefined || item === undefined) {
                element = this.#spare.pop() ?? this.#make();
                item = { key, index: -1 };
                this.#items.set(element, item);
                this.#rows.set(key, element);
                bind(element, key, index);
                if (element.parentNode !== this) this.append(element);
            }
            this.#place(element, item, index++);
        }
        for (const element of this.#spare) if (element.parentNode === this) element.remove();
        if (refocus >= 0) (this.elementAt(refocus) ?? this.elementAt(refocus - 1))?.focus({ preventScroll: true });
    }

    /** The row showing `key`, or null when none does. */
    elementOf(key: K): E | null {
        return this.#rows.get(key) ?? null;
    }

    /** The row showing the item at `index`, or null when none does. */
    elementAt(index: number): E | null {
        for (const [element, item] of this.#items) if (item.index === index) return element;
        return null;
    }

    /** The index of the item a row shows, or -1 for an element that isn't one of its rows. */
    indexOf(element: Element): number {
        for (const [row, item] of this.#items) if (row === element) return item.index;
        return -1;
    }

    #make(): E {
        if (this.create === null) throw new Error("virtual-list has no create to make its rows.");
        return this.create();
    }

    #place(element: E, item: Item<K>, index: number): void {
        if (item.index === index) return;
        item.index = index;
        position(element, index, this.#itemHeight);
    }

    /** The row an event's target is in, or null. */
    #rowOf(target: EventTarget | null): E | null {
        for (let node = target instanceof Node ? target : null; node !== null; node = node.parentNode) {
            if (node.parentNode === this) {
                for (const row of this.#items.keys()) if (row === node) return row;
                return null;
            }
        }
        return null;
    }

    /** The items in view, and `overscan` of the screen's height more on either side. */
    #rangeAround(): Range {
        const over = innerHeight * this.overscan;
        const height = this.#itemHeight;
        return {
            start: Math.max(0, Math.floor((this.#scrollTop - over) / height)),
            end: Math.max(0, Math.ceil((this.#scrollTop + this.#height + over) / height)),
        };
    }

    /**
     * Takes the range around the view once the view comes within half its overscan of the range's edge, or at once
     * when `resized`, dispatching `virtual-range` if that changed it.
     */
    #measure(resized = false): void {
        const margin = innerHeight * this.overscan / 2;
        const { start, end } = this.#range;
        const height = this.#itemHeight;
        const covered = start * height <= Math.max(0, this.#scrollTop - margin) && end * height >= this.#scrollTop + this.#height + margin;
        if (covered && !resized) return;
        const next = this.#rangeAround();
        if (next.start === start && next.end === end) return;
        this.#range = next;
        this.dispatchEvent(new CustomEvent("virtual-range", { detail: next, bubbles: true, composed: true }));
    }
}

/** Items from `start` up to `end`. */
type Range = { readonly start: number; readonly end: number };

type Item<K> = { readonly key: K; index: number };

const template = document.createElement("template");
template.innerHTML = `
<style>
    :host { display: block; overflow-y: auto; }
    .spacer { position: relative; }
    ::slotted(*) { position: absolute; top: 0; left: 0; right: 0; box-sizing: border-box; height: var(--item-height); }
</style>
<div class="spacer"><slot></slot></div>`;

const position = (element: HTMLElement, index: number, height: number): void => {
    element.style.transform = `translateY(${index * height}px)`;
};

const same = <T>(a: readonly T[], b: readonly T[]): boolean => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
};

type VirtualListEvents = {
    readonly "virtual-range": CustomEvent<Range>;
};

declare global {
    interface HTMLElementTagNameMap {
        "virtual-list": VirtualList;
    }
    interface HTMLElementEventMap extends VirtualListEvents {}
}
