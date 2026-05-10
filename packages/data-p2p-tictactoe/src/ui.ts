// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Minimal DOM helpers — no framework, just functions that return/update elements.

/** Mount content into the #app div, replacing whatever is there. */
export const setScreen = (el: HTMLElement): void => {
    const app = document.getElementById("app")!;
    app.innerHTML = "";
    app.appendChild(el);
};

/** Create a DOM element with optional class + children. */
export const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attrs: Partial<Record<string, string>> = {},
    ...children: (HTMLElement | string)[]
): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v !== undefined) node.setAttribute(k, v);
    }
    for (const child of children) {
        if (typeof child === "string") node.append(child);
        else node.appendChild(child);
    }
    return node;
};

/** Show a full-width status banner (info / error / success). */
export const banner = (
    text: string,
    kind: "info" | "error" | "success" = "info",
): HTMLElement => el("div", { class: `banner banner--${kind}` }, text);

/** A textarea pre-filled with a value, easy to copy. */
export const codeBox = (value: string, label: string): HTMLElement => {
    const ta = el("textarea", { class: "codebox", readonly: "", rows: "4" });
    (ta as HTMLTextAreaElement).value = value;
    const btn = el("button", { class: "btn btn--sm" }, "Copy");
    btn.addEventListener("click", () => {
        navigator.clipboard.writeText(value).catch(() => {
            (ta as HTMLTextAreaElement).select();
            document.execCommand("copy");
        });
        btn.textContent = "Copied!";
        setTimeout(() => { btn.textContent = "Copy"; }, 1500);
    });
    return el("div", { class: "codebox-wrap" },
        el("label", { class: "label" }, label),
        ta,
        btn,
    );
};

/** A textarea for the user to paste a code into, plus a submit button. */
export const pasteBox = (
    label: string,
    buttonLabel: string,
    onSubmit: (value: string) => void,
): HTMLElement => {
    const ta = el("textarea", { class: "codebox", rows: "4", placeholder: "Paste code here…" });
    const btn = el("button", { class: "btn" }, buttonLabel);
    btn.addEventListener("click", () => {
        const value = (ta as HTMLTextAreaElement).value.trim();
        if (value) onSubmit(value);
    });
    return el("div", { class: "codebox-wrap" },
        el("label", { class: "label" }, label),
        ta,
        btn,
    );
};
