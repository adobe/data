// © 2026 Adobe. MIT License. See /LICENSE for details.
/**
 * `<selection-names>`: the selections saved by name, `names`, and a field to save the selection under a new one. Saving
 * dispatches `selection-save`; a name's buttons dispatch `selection-restore`, replacing the selection or, with `add`,
 * beside it, and `selection-forget`; each with the name.
 */
export class SelectionNames extends HTMLElement {
    #names: readonly string[] = [];
    readonly #list: HTMLElement;

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.append(template.content.cloneNode(true));
        const list = root.querySelector<HTMLElement>(".names");
        const form = root.querySelector("form");
        if (list === null || form === null) throw new Error("selection-names' template is incomplete.");
        this.#list = list;
        form.addEventListener("submit", event => {
            event.preventDefault();
            const input = form.elements.namedItem("name");
            if (!(input instanceof HTMLInputElement) || input.value.trim() === "") return;
            this.#dispatch("selection-save", { name: input.value.trim() });
            input.value = "";
        });
        list.addEventListener("click", event => {
            const button = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-action]") : null;
            const name = button?.closest<HTMLElement>("[data-name]")?.dataset["name"];
            const action = button?.dataset["action"];
            if (name === undefined) return;
            if (action === "forget") this.#dispatch("selection-forget", { name });
            else this.#dispatch("selection-restore", { name, add: action === "add" });
        });
    }

    set names(value: readonly string[]) {
        if (value.length === this.#names.length && value.every((name, i) => name === this.#names[i])) return;
        this.#names = value;
        this.#list.replaceChildren(...value.map(name => {
            const row = document.createElement("li");
            row.dataset["name"] = name;
            row.append(
                Object.assign(document.createElement("button"), { className: "name", textContent: name, title: "Select these faces" }),
                Object.assign(document.createElement("button"), { textContent: "+", title: "Add these faces to the selection" }),
                Object.assign(document.createElement("button"), { textContent: "×", title: "Forget this selection" }),
            );
            const [select, add, forget] = row.querySelectorAll("button");
            select?.setAttribute("data-action", "restore");
            add?.setAttribute("data-action", "add");
            forget?.setAttribute("data-action", "forget");
            return row;
        }));
    }

    #dispatch(type: string, detail: unknown): void {
        this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
    }
}

const template = document.createElement("template");
template.innerHTML = `
<style>
    :host { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
    form { display: flex; gap: 4px; }
    input { flex: 1; min-width: 0; font: inherit; color: inherit; background: rgb(255 255 255 / 0.06); border: 1px solid rgb(255 255 255 / 0.15); border-radius: 4px; padding: 3px 5px; }
    button { font: inherit; color: inherit; background: rgb(255 255 255 / 0.06); border: 1px solid rgb(255 255 255 / 0.12); border-radius: 4px; padding: 2px 6px; cursor: pointer; }
    ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
    li { display: flex; gap: 2px; }
    .name { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; }
</style>
<form><input name="name" placeholder="Name the selection" aria-label="Selection name"><button>Save</button></form>
<ul class="names"></ul>`;

type SelectionNamesEvents = {
    readonly "selection-save": CustomEvent<{ readonly name: string }>;
    readonly "selection-restore": CustomEvent<{ readonly name: string; readonly add: boolean }>;
    readonly "selection-forget": CustomEvent<{ readonly name: string }>;
};

declare global {
    interface HTMLElementTagNameMap {
        "selection-names": SelectionNames;
    }
    interface HTMLElementEventMap extends SelectionNamesEvents {}
}
