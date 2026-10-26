// © 2026 Adobe. MIT License. See /LICENSE for details.
/**
 * `<guide-files>`: tabs for a chapter's example files, by name, `selected` the one shown, by index; hidden while there's
 * only one. Choosing a tab dispatches `guide-select-file` and leaves the tab selected until the owner writes it.
 */

export type GuideFilesEvents = {
    readonly "guide-select-file": CustomEvent<{ readonly file: number }>;
};

const template = document.createElement("template");
template.innerHTML = `
<style>
    :host { display: block; padding: 0 var(--spectrum-spacing-300, 16px); border-bottom: 1px solid var(--spectrum-gray-200); }
    :host([hidden]) { display: none; }
</style>
<sp-tabs quiet size="s" label="Example files"></sp-tabs>`;

export class GuideFiles extends HTMLElement {
    readonly #tabs: HTMLElement;
    #names: readonly string[] = [];
    #selected = 0;

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.append(template.content.cloneNode(true));
        const tabs = root.querySelector("sp-tabs");
        if (!(tabs instanceof HTMLElement)) throw new Error("guide-files' template is missing its tabs.");
        this.#tabs = tabs;
        tabs.addEventListener("change", () => {
            const file = Number(Reflect.get(tabs, "selected"));
            // The owner writes the selection back; until then the tabs show the one it gave.
            Reflect.set(tabs, "selected", String(this.#selected));
            if (file !== this.#selected) this.dispatchEvent(new CustomEvent("guide-select-file", { detail: { file }, bubbles: true, composed: true }));
        });
    }

    get names(): readonly string[] {
        return this.#names;
    }

    set names(value: readonly string[]) {
        if (value.length === this.#names.length && value.every((name, index) => name === this.#names[index])) return;
        this.#names = value;
        this.hidden = value.length < 2;
        this.#tabs.replaceChildren(...value.map((name, index) => {
            const tab = document.createElement("sp-tab");
            // Spectrum's tabs take their tabs by role as they're slotted, before a new tab gives itself its role.
            tab.setAttribute("role", "tab");
            tab.setAttribute("label", name);
            tab.setAttribute("value", String(index));
            return tab;
        }));
        this.#select();
    }

    get selected(): number {
        return this.#selected;
    }

    set selected(value: number) {
        if (value === this.#selected) return;
        this.#selected = value;
        this.#select();
    }

    #select(): void {
        Reflect.set(this.#tabs, "selected", String(this.#selected));
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "guide-files": GuideFiles;
    }
    interface HTMLElementEventMap extends GuideFilesEvents {}
}
