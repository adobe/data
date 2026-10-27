// © 2026 Adobe. MIT License. See /LICENSE for details.
/**
 * `<guide-status>`: where the shown chapter's run is, in a line: a progress circle while it compiles and runs, as an
 * animation does until its page goes, then a status light saying how it ended. `state` is the run's.
 */

export type StatusState = "waiting" | "compiling" | "running" | "finished" | "failed" | "rejected" | "compiled" | "unavailable" | "retrying";

const template = document.createElement("template");
template.innerHTML = `
<style>
    :host { display: inline-flex; align-items: center; gap: 8px; min-height: 32px; }
    [hidden] { display: none; }
</style>
<sp-progress-circle size="s" indeterminate label="Working" hidden></sp-progress-circle>
<sp-status-light size="m" variant="neutral" role="status"></sp-status-light>`;

/** Each state's light and words. */
const shown = (state: StatusState): { readonly variant: string; readonly text: string } => {
    switch (state) {
        case "waiting": return { variant: "neutral", text: "Loading the compiler…" };
        case "compiling": return { variant: "neutral", text: "Compiling…" };
        case "running": return { variant: "info", text: "Running…" };
        case "finished": return { variant: "positive", text: "Finished" };
        case "failed": return { variant: "negative", text: "Failed: see Console" };
        case "rejected": return { variant: "negative", text: "The ECS build rejected it: see Problems" };
        case "compiled": return { variant: "notice", text: "Compiled: this host can't run examples" };
        case "retrying": return { variant: "notice", text: "Retrying the compiler…" };
        case "unavailable": return { variant: "negative", text: "The compiler failed: see Problems" };
    }
};

/** States the run is still on its way in. */
const working: ReadonlySet<StatusState> = new Set(["waiting", "compiling", "running", "retrying"]);

export class GuideStatus extends HTMLElement {
    readonly #progress: HTMLElement;
    readonly #light: HTMLElement;
    #state: StatusState = "waiting";

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.append(template.content.cloneNode(true));
        const progress = root.querySelector("sp-progress-circle");
        const light = root.querySelector("sp-status-light");
        if (!(progress instanceof HTMLElement && light instanceof HTMLElement)) throw new Error("guide-status's template is missing a part.");
        this.#progress = progress;
        this.#light = light;
        this.#render();
    }

    get state(): StatusState {
        return this.#state;
    }

    set state(value: StatusState) {
        if (value === this.#state) return;
        this.#state = value;
        this.#render();
    }

    #render(): void {
        const { variant, text } = shown(this.#state);
        this.#progress.hidden = !working.has(this.#state);
        this.#light.setAttribute("variant", variant);
        this.#light.textContent = text;
        this.setAttribute("state", this.#state);
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "guide-status": GuideStatus;
    }
}
