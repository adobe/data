// © 2026 Adobe. MIT License. See /LICENSE for details.
/**
 * `<library-bar>`: where the document is: the library folder by name, or that there's none or it needs reconnecting,
 * the document's path, and `message`, what last happened, such as a file saved or one that couldn't be read. Clicking
 * the folder dispatches `library-folder`, to choose one, or reconnect one that needs it.
 */
export class LibraryBar extends HTMLElement {
    #folder: string | null = null;
    #state: "none" | "permission" | "ready" = "none";
    #document: string | null = null;
    #message: string | null = null;
    readonly #parts: { readonly folder: HTMLElement; readonly document: HTMLElement; readonly message: HTMLElement };

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.append(template.content.cloneNode(true));
        const part = (selector: string): HTMLElement => {
            const found = root.querySelector<HTMLElement>(selector);
            if (found === null) throw new Error(`library-bar's template has no ${selector}.`);
            return found;
        };
        this.#parts = { folder: part(".folder"), document: part(".document"), message: part(".message") };
        this.#parts.folder.addEventListener("click", () => this.dispatchEvent(new CustomEvent("library-folder", { bubbles: true, composed: true })));
        this.#render();
    }

    set library(value: { readonly folder: string | null; readonly state: "none" | "permission" | "ready"; readonly message: string | null }) {
        if (value.folder === this.#folder && value.state === this.#state && value.message === this.#message) return;
        this.#folder = value.folder;
        this.#state = value.state;
        this.#message = value.message;
        this.#render();
    }

    set document(value: string | null) {
        if (value === this.#document) return;
        this.#document = value;
        this.#render();
    }

    #render(): void {
        const { folder, document, message } = this.#parts;
        folder.title = this.#state === "permission" ? "Reconnect the library folder" : "Choose a library folder";
        folder.textContent = this.#folder === null ? "No library folder" : this.#state === "permission" ? `${this.#folder} (reconnect)` : this.#folder;
        document.textContent = this.#document ?? "Untitled";
        message.textContent = this.#message ?? "";
    }
}

const template = document.createElement("template");
template.innerHTML = `
<style>
    :host { display: flex; align-items: center; gap: 6px; font-size: 13px; min-width: 0; }
    .folder { font: inherit; font-weight: 600; color: inherit; background: none; border: 0; border-radius: 4px; padding: 2px 6px; margin: -2px -6px; cursor: pointer; }
    .folder:hover { background: rgb(255 255 255 / 0.1); }
    .document { opacity: 0.8; }
    .message { margin-left: 8px; color: #fbbf24; font-size: 12px; max-width: 40ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
<button type="button" class="folder"></button><span>/</span><span class="document"></span><span class="message"></span>`;

type LibraryBarEvents = {
    readonly "library-folder": CustomEvent<null>;
};

declare global {
    interface HTMLElementTagNameMap {
        "library-bar": LibraryBar;
    }
    interface HTMLElementEventMap extends LibraryBarEvents {}
}
