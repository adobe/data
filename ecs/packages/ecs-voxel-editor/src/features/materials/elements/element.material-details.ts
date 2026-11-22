// © 2026 Adobe. MIT License. See /LICENSE for details.
/**
 * `<material-details>`: a material, `material`, each of its properties editable: its name, color, metallic and
 * roughness. Changing a value dispatches `material-change` with
 * them all as the field moves; changing the name dispatches `material-rename` once it's committed; Copy dispatches
 * `material-copy`. Each with the material's id. A field being edited keeps what the user typed until it's committed;
 * `error` shows why a change wasn't taken.
 */
export class MaterialDetails extends HTMLElement {
    #material: MaterialValues | null = null;
    readonly #form: HTMLFormElement;
    readonly #error: HTMLElement;

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.append(template.content.cloneNode(true));
        const form = root.querySelector("form");
        const error = root.querySelector<HTMLElement>(".error");
        if (form === null || error === null) throw new Error("material-details' template is incomplete.");
        this.#form = form;
        this.#error = error;
        form.addEventListener("submit", event => event.preventDefault());
        form.addEventListener("input", event => {
            if (event.target instanceof HTMLInputElement && event.target.name !== "name") this.#changed();
        });
        form.addEventListener("change", event => {
            if (event.target instanceof HTMLInputElement && event.target.name === "name") this.#renamed();
        });
        root.querySelector(".copy")?.addEventListener("click", () => {
            if (this.#material !== null) this.#dispatch("material-copy", { id: this.#material.id });
        });
    }

    set material(value: MaterialValues | null) {
        const was = this.#material;
        if (was !== null && value !== null && Object.entries(value).every(([key, item]) => Reflect.get(was, key) === item)) return;
        this.#material = value;
        this.hidden = value === null;
        if (value === null) return;
        if (was?.id !== value.id) this.error = null;
        for (const [key, item] of Object.entries(value)) {
            const field = this.#field(key);
            // The field the user is in keeps what they typed.
            if (field === null || field === this.shadowRoot?.activeElement && was?.id === value.id) continue;
            field.value = typeof item === "number" ? String(Math.round(item * 1000) / 1000) : item;
            this.#shown(field);
        }
    }

    set error(value: string | null) {
        this.#error.textContent = value ?? "";
    }

    #field(name: string): HTMLInputElement | null {
        const field = this.#form.elements.namedItem(name);
        return field instanceof HTMLInputElement ? field : null;
    }

    /** Writes a slider's value beside it. */
    #shown(field: HTMLInputElement): void {
        const output = this.#form.querySelector(`output[for="${field.id}"]`);
        if (output !== null) output.textContent = field.value;
    }

    #changed(): void {
        if (this.#material === null) return;
        const number = (name: string): number => Number(this.#field(name)?.value ?? 0);
        for (const name of ["metallic", "roughness"]) {
            const field = this.#field(name);
            if (field !== null) this.#shown(field);
        }
        this.#dispatch("material-change", {
            id: this.#material.id, color: this.#field("color")?.value ?? "#000000",
            metallic: number("metallic"), roughness: number("roughness"),
        });
    }

    #renamed(): void {
        if (this.#material !== null) this.#dispatch("material-rename", { id: this.#material.id, name: this.#field("name")?.value ?? "" });
    }

    #dispatch(type: string, detail: unknown): void {
        this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
    }
}

/** A material as `<material-details>` shows it: its id and name, its sRGB color as `#rrggbb`, its metallic and roughness. */
type MaterialValues = {
    readonly id: number;
    readonly name: string;
    readonly color: string;
    readonly metallic: number;
    readonly roughness: number;
};

const template = document.createElement("template");
template.innerHTML = `
<style>
    :host { display: block; font-size: 12px; }
    :host([hidden]) { display: none; }
    form { display: grid; grid-template-columns: auto 1fr auto; gap: 4px 6px; align-items: center; }
    label { color: #9ca3af; }
    input { font: inherit; color: inherit; background: rgb(255 255 255 / 0.06); border: 1px solid rgb(255 255 255 / 0.15); border-radius: 4px; padding: 2px 5px; min-width: 0; }
    input[type="range"] { padding: 0; }
    input[type="color"] { padding: 0; height: 22px; }
    .wide { grid-column: 2 / -1; }
    output { min-width: 3ch; text-align: right; color: #9ca3af; }
    .copy { grid-column: 1 / -1; font: inherit; color: inherit; background: rgb(255 255 255 / 0.1); border: 1px solid rgb(255 255 255 / 0.15); border-radius: 4px; padding: 3px; cursor: pointer; }
    .error { color: #f87171; min-height: 1em; }
</style>
<form>
    <label for="name">Name</label><input id="name" name="name" class="wide" aria-label="Name">
    <label for="color">Color</label><input id="color" name="color" type="color" class="wide">
    <label for="metallic">Metallic</label><input id="metallic" name="metallic" type="range" min="0" max="1" step="0.01"><output for="metallic"></output>
    <label for="roughness">Rough</label><input id="roughness" name="roughness" type="range" min="0" max="1" step="0.01"><output for="roughness"></output>
    <button type="button" class="copy" title="A new material like this one">Copy as a new material</button>
</form>
<div class="error" role="alert"></div>`;

type MaterialDetailsEvents = {
    readonly "material-change": CustomEvent<{ readonly id: number; readonly color: string; readonly metallic: number; readonly roughness: number }>;
    readonly "material-rename": CustomEvent<{ readonly id: number; readonly name: string }>;
    readonly "material-copy": CustomEvent<{ readonly id: number }>;
};

declare global {
    interface HTMLElementTagNameMap {
        "material-details": MaterialDetails;
    }
    interface HTMLElementEventMap extends MaterialDetailsEvents {}
}
