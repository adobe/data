// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { DialogField } from "./element.form-dialog/type.dialog-field.js";

/**
 * `<form-dialog>`: a modal dialog asking for a few values. `ask` shows it with a title, fields and a submit label, and
 * resolves to the values by field name once submitted, or null once cancelled, as Escape does. `error` shows why the
 * values weren't taken, keeping it open: `ask`'s `check` gives it, or null to take them.
 */
export class FormDialog extends HTMLElement {
    readonly #dialog: HTMLDialogElement;
    readonly #form: HTMLFormElement;

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.append(template.content.cloneNode(true));
        const dialog = root.querySelector("dialog");
        const form = root.querySelector("form");
        if (dialog === null || form === null) throw new Error("form-dialog's template is incomplete.");
        this.#dialog = dialog;
        this.#form = form;
        // Chrome skips the cancel event for a repeated Escape without a user gesture between, so Escape is handled here too.
        dialog.addEventListener("keydown", event => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
        });
    }

    ask(request: {
        readonly title: string;
        readonly fields: readonly DialogField[];
        readonly submit: string;
        readonly check?: (values: Readonly<Record<string, string>>) => Promise<string | null> | string | null;
    }): Promise<Readonly<Record<string, string>> | null> {
        const root = this.shadowRoot;
        const title = root?.querySelector(".title");
        const fields = root?.querySelector(".fields");
        const submit = root?.querySelector<HTMLButtonElement>(".submit");
        const error = root?.querySelector(".error");
        if (title == null || fields == null || submit == null || error == null) return Promise.resolve(null);
        title.textContent = request.title;
        submit.textContent = request.submit;
        error.textContent = "";
        fields.replaceChildren(...request.fields.flatMap(field => {
            const input = Object.assign(document.createElement("input"), { name: field.name, type: field.kind, value: field.value, id: `field-${field.name}`, required: true });
            if (field.min !== undefined) input.min = String(field.min);
            if (field.max !== undefined) input.max = String(field.max);
            return [Object.assign(document.createElement("label"), { htmlFor: input.id, textContent: field.label }), input];
        }));
        return new Promise(resolve => {
            const values = (): Record<string, string> => Object.fromEntries(request.fields.map(field => {
                const input = this.#form.elements.namedItem(field.name);
                return [field.name, input instanceof HTMLInputElement ? input.value : ""];
            }));
            const finish = (result: Readonly<Record<string, string>> | null): void => {
                this.#form.removeEventListener("submit", submitted);
                this.#dialog.removeEventListener("cancel", cancelled);
                cancel?.removeEventListener("click", cancelled);
                this.#dialog.close();
                resolve(result);
            };
            const submitted = (event: Event): void => {
                event.preventDefault();
                const given = values();
                void Promise.resolve(request.check?.(given) ?? null).then(problem => {
                    if (problem === null) finish(given);
                    else error.textContent = problem;
                });
            };
            const cancelled = (event: Event): void => {
                event.preventDefault();
                finish(null);
            };
            const cancel = root?.querySelector(".cancel");
            this.#form.addEventListener("submit", submitted);
            this.#dialog.addEventListener("cancel", cancelled);
            cancel?.addEventListener("click", cancelled);
            this.#dialog.showModal();
            this.#form.querySelector("input")?.select();
        });
    }
}

const template = document.createElement("template");
template.innerHTML = `
<style>
    dialog { min-width: 320px; padding: 16px; color: #e5e7eb; background: #26282e; border: 1px solid rgb(255 255 255 / 0.12); border-radius: 8px;
        box-shadow: 0 16px 48px rgb(0 0 0 / 0.5); font: 13px/1.4 system-ui, sans-serif; }
    dialog::backdrop { background: rgb(0 0 0 / 0.45); }
    h2 { margin: 0 0 12px; font-size: 15px; font-weight: 600; }
    .fields { display: grid; grid-template-columns: auto 1fr; gap: 8px 10px; align-items: center; }
    label { color: #9ca3af; }
    input { font: inherit; color: inherit; background: rgb(255 255 255 / 0.06); border: 1px solid rgb(255 255 255 / 0.15); border-radius: 4px; padding: 4px 6px; }
    .error { color: #f87171; min-height: 1.4em; margin-top: 8px; }
    .buttons { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
    button { font: inherit; color: inherit; background: rgb(255 255 255 / 0.08); border: 1px solid rgb(255 255 255 / 0.15); border-radius: 4px; padding: 4px 12px; cursor: pointer; }
    .submit { background: var(--editor-accent, #3b82f6); border-color: transparent; color: #fff; }
</style>
<dialog>
    <form method="dialog">
        <h2 class="title"></h2>
        <div class="fields"></div>
        <div class="error" role="alert"></div>
        <div class="buttons"><button type="button" class="cancel">Cancel</button><button class="submit"></button></div>
    </form>
</dialog>`;

declare global {
    interface HTMLElementTagNameMap {
        "form-dialog": FormDialog;
    }
}
