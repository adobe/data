// © 2026 Adobe. MIT License. See /LICENSE for details.
/**
 * `<guide-nav>`: the guide's chapters, by part, each a link to its address, in a Spectrum side navigation. `chapters`
 * lists them and `selected` names the one shown, by its address. Following a link changes the page's address, which
 * whoever owns the chapters reads; the element never selects one itself.
 */

/** A chapter as the navigation lists it. */
export type NavChapter = { readonly slug: string; readonly number: number; readonly title: string; readonly part: string };

const template = document.createElement("template");
template.innerHTML = `
<style>
    :host { display: block; box-sizing: border-box; overflow-y: auto; padding: var(--spectrum-spacing-200) var(--spectrum-spacing-100); }
    sp-sidenav { width: 100%; }
</style>
<sp-sidenav label="Chapters"></sp-sidenav>`;

const label = (item: NavChapter): string => item.number === 0 ? item.title : `${item.number}. ${item.title}`;

const itemOf = (item: NavChapter): HTMLElement => {
    const link = document.createElement("sp-sidenav-item");
    link.setAttribute("value", item.slug);
    link.setAttribute("label", label(item));
    link.setAttribute("href", `#${item.slug}`);
    return link;
};

export class GuideNav extends HTMLElement {
    readonly #sidenav: HTMLElement;
    #chapters: readonly NavChapter[] = [];
    #selected = "";

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.append(template.content.cloneNode(true));
        const sidenav = root.querySelector("sp-sidenav");
        if (!(sidenav instanceof HTMLElement)) throw new Error("guide-nav's template is missing its sidenav.");
        this.#sidenav = sidenav;
    }

    get chapters(): readonly NavChapter[] {
        return this.#chapters;
    }

    set chapters(value: readonly NavChapter[]) {
        if (value === this.#chapters) return;
        this.#chapters = value;
        const parts = new Map<string, HTMLElement>();
        const items: HTMLElement[] = [];
        for (const item of value) {
            if (item.part === "") {
                items.push(itemOf(item));
                continue;
            }
            let heading = parts.get(item.part);
            if (heading === undefined) {
                heading = document.createElement("sp-sidenav-heading");
                heading.setAttribute("label", item.part);
                parts.set(item.part, heading);
                items.push(heading);
            }
            heading.append(itemOf(item));
        }
        this.#sidenav.replaceChildren(...items);
        this.#select();
    }

    get selected(): string {
        return this.#selected;
    }

    set selected(value: string) {
        if (value === this.#selected) return;
        this.#selected = value;
        this.#select();
    }

    #select(): void {
        Reflect.set(this.#sidenav, "value", this.#selected);
        for (const item of this.#sidenav.querySelectorAll("sp-sidenav-item")) item.toggleAttribute("selected", item.getAttribute("value") === this.#selected);
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "guide-nav": GuideNav;
    }
}
