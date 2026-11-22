// © 2026 Adobe. MIT License. See /LICENSE for details.
/**
 * `<model-size>`: a model's size in voxels, `size`, each way editable, with presets making it a cube of 2 to 64, buttons
 * doubling or halving it, a lock, `locked`, and a button fitting it to its contents. It dispatches `model-size` with the
 * size asked for, `model-size-lock` with whether to lock it, and `model-size-fit`. `label` names the model.
 */
export class ModelSize extends HTMLElement {
    #size: readonly [number, number, number] = [0, 0, 0];
    #locked = true;
    readonly #parts: { readonly label: HTMLElement; readonly lock: HTMLInputElement; readonly fields: readonly HTMLInputElement[] };

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.append(template.content.cloneNode(true));
        const label = root.querySelector<HTMLElement>(".label");
        const lock = root.querySelector<HTMLInputElement>(".lock input");
        const fields = [...root.querySelectorAll<HTMLInputElement>(".axes input")];
        if (label === null || lock === null || fields.length !== 3) throw new Error("model-size's template is incomplete.");
        this.#parts = { label, lock, fields };
        root.querySelector(".presets")?.append(...presets.map(n => Object.assign(document.createElement("button"), { type: "button", textContent: String(n), title: `${n} × ${n} × ${n}` })));
        for (const field of fields) field.addEventListener("change", () => this.#ask(fields.map(each => Number(each.value))));
        lock.addEventListener("change", () => this.#dispatch("model-size-lock", { locked: lock.checked }));
        root.addEventListener("click", event => {
            const button = event.target instanceof HTMLButtonElement ? event.target : null;
            if (button === null) return;
            const [x, y, z] = this.#size;
            if (button.closest(".presets") !== null) this.#ask([Number(button.textContent), Number(button.textContent), Number(button.textContent)]);
            else if (button.classList.contains("double")) this.#ask([x * 2, y * 2, z * 2]);
            else if (button.classList.contains("halve")) this.#ask([x / 2, y / 2, z / 2]);
            else if (button.classList.contains("fit")) this.#dispatch("model-size-fit", {});
        });
    }

    set label(value: string) {
        this.#parts.label.textContent = value;
    }

    set size(value: readonly [number, number, number]) {
        if (value.every((each, axis) => each === this.#size[axis])) return;
        this.#size = value;
        this.#parts.fields.forEach((field, axis) => { field.value = String(value[axis] ?? 1); });
    }

    set locked(value: boolean) {
        if (value === this.#locked) return;
        this.#locked = value;
        this.#parts.lock.checked = value;
    }

    /** Asks for a size, each way a whole number of voxels from 1 to 256; the fields show what's taken once it is. */
    #ask(size: readonly number[]): void {
        const [x, y, z] = size.map(each => Math.min(256, Math.max(1, Math.round(Number.isFinite(each) ? each : 1))));
        this.#dispatch("model-size", { size: [x ?? 1, y ?? 1, z ?? 1] });
    }

    #dispatch(type: string, detail: unknown): void {
        this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
    }
}

/** The sizes the presets make a cube of. */
const presets: readonly number[] = [2, 4, 8, 16, 32, 64];

const template = document.createElement("template");
template.innerHTML = `
<style>
    :host { display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
    .label { color: #9ca3af; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .axes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
    .axes label { display: flex; align-items: center; gap: 3px; color: #9ca3af; }
    input[type="number"] { width: 100%; min-width: 0; font: inherit; color: inherit; background: rgb(255 255 255 / 0.06); border: 1px solid rgb(255 255 255 / 0.15); border-radius: 4px; padding: 2px 4px; }
    .row { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; }
    .presets { display: grid; grid-template-columns: repeat(6, 1fr); gap: 3px; }
    button { font: inherit; color: inherit; background: rgb(255 255 255 / 0.08); border: 1px solid rgb(255 255 255 / 0.15); border-radius: 4px; padding: 2px 4px; cursor: pointer; }
    button:hover { background: rgb(255 255 255 / 0.14); }
    .row button { flex: 1; }
    .lock { display: flex; align-items: center; gap: 6px; }
</style>
<span class="label"></span>
<div class="axes">
    <label>x <input type="number" min="1" max="256" aria-label="Size x"></label>
    <label>y <input type="number" min="1" max="256" aria-label="Size y"></label>
    <label>z <input type="number" min="1" max="256" aria-label="Size z"></label>
</div>
<div class="presets" aria-label="Presets"></div>
<div class="row">
    <button type="button" class="halve" title="Halve each way">÷ 2</button>
    <button type="button" class="double" title="Double each way">× 2</button>
    <button type="button" class="fit" title="Size to the contents, moved to run from 0">Fit to contents</button>
</div>
<label class="lock" title="Locked, editing stops at the bounds; unlocked, it grows the model"><input type="checkbox" checked> Lock size</label>`;

type ModelSizeEvents = {
    readonly "model-size": CustomEvent<{ readonly size: readonly [number, number, number] }>;
    readonly "model-size-lock": CustomEvent<{ readonly locked: boolean }>;
    readonly "model-size-fit": CustomEvent<Record<string, never>>;
};

declare global {
    interface HTMLElementTagNameMap {
        "model-size": ModelSize;
    }
    interface HTMLElementEventMap extends ModelSizeEvents {}
}
