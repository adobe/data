// © 2026 Adobe. MIT License. See /LICENSE for details.
/**
 * `<guide-tabs>`: the run's window, a tab each for its Console, its Output, the Problems and what its systems compiled
 * to, whose panels its children fill by slot: `console`, `output`, `problems` and `compiled`. `selected` is the tab shown. `badges` say what each tab holds: a
 * count, and whether an error is among it, shown on a tab while it isn't selected, and on Problems always. Choosing a
 * tab dispatches `guide-select-tab`. Panels not shown keep their size, hidden, so a frame on one goes on drawing.
 */

export type Tab = "console" | "output" | "problems" | "compiled";
export type Badge = { readonly count: number; readonly errors: boolean };
export type Badges = { readonly [T in Tab]: Badge };

export type GuideTabsEvents = {
    readonly "guide-select-tab": CustomEvent<{ readonly tab: Tab }>;
};

const tabs: readonly { readonly tab: Tab; readonly label: string }[] = [
    { tab: "console", label: "Console" }, { tab: "output", label: "Output" }, { tab: "problems", label: "Problems" }, { tab: "compiled", label: "Compiled" },
];

const isTab = (value: unknown): value is Tab => tabs.some(item => item.tab === value);

const none: Badge = { count: 0, errors: false };
export const noBadges: Badges = { console: none, output: none, problems: none, compiled: none };

const template = document.createElement("template");
template.innerHTML = `
<style>
    :host { display: flex; flex-direction: column; min-height: 0; }
    /* The strip's padding is its wrapper's: tabs place their selection underline from their own edge. */
    .strip { flex: none; padding: 0 var(--spectrum-spacing-300, 16px); border-bottom: 1px solid var(--spectrum-gray-200); }
    sp-tab { white-space: nowrap; }
    sp-badge { margin-inline-start: 6px; vertical-align: middle; }
    .panels { position: relative; flex: 1; min-height: 0; }
    [role=tabpanel] { position: absolute; inset: 0; display: flex; flex-direction: column; visibility: hidden; }
    [role=tabpanel][data-shown] { visibility: visible; }
    ::slotted(*) { flex: 1; min-height: 0; }
    [hidden] { display: none; }
</style>
<div class="strip"><sp-tabs selected="console" label="The run" quiet>
    ${tabs.map(({ tab, label }) => `<sp-tab value="${tab}" id="tab-${tab}" aria-controls="panel-${tab}">${label}<sp-badge size="s" hidden></sp-badge></sp-tab>`).join("")}
</sp-tabs></div>
<div class="panels">
    ${tabs.map(({ tab }) => `<div role="tabpanel" id="panel-${tab}" aria-labelledby="tab-${tab}"><slot name="${tab}"></slot></div>`).join("")}
</div>`;

export class GuideTabs extends HTMLElement {
    readonly #tabs: HTMLElement;
    #selected: Tab = "console";
    #badges: Badges = noBadges;

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.append(template.content.cloneNode(true));
        const strip = root.querySelector("sp-tabs");
        if (!(strip instanceof HTMLElement)) throw new Error("guide-tabs' template is missing a part.");
        this.#tabs = strip;
        strip.addEventListener("change", () => {
            const chosen: unknown = Reflect.get(strip, "selected");
            // The tab shown stays the owner's until it writes `selected`.
            Reflect.set(strip, "selected", this.#selected);
            if (isTab(chosen) && chosen !== this.#selected) this.dispatchEvent(new CustomEvent("guide-select-tab", { detail: { tab: chosen }, bubbles: true, composed: true }));
        });
        this.#render();
    }

    get selected(): Tab {
        return this.#selected;
    }

    set selected(value: Tab) {
        if (value === this.#selected) return;
        this.#selected = value;
        this.#render();
    }

    get badges(): Badges {
        return this.#badges;
    }

    set badges(value: Badges) {
        if (value === this.#badges) return;
        this.#badges = value;
        this.#render();
    }

    #render(): void {
        const root = this.shadowRoot;
        if (root === null) return;
        Reflect.set(this.#tabs, "selected", this.#selected);
        for (const { tab, label } of tabs) {
            const panel = root.getElementById(`panel-${tab}`);
            const shown = tab === this.#selected;
            panel?.toggleAttribute("data-shown", shown);
            panel?.toggleAttribute("inert", !shown);
            const badge = root.querySelector(`#tab-${tab} sp-badge`);
            const { count, errors } = this.#badges[tab];
            const visible = count > 0 && (tab === "problems" || !shown);
            if (badge instanceof HTMLElement) {
                badge.hidden = !visible;
                badge.textContent = count > 99 ? "99+" : String(count);
                badge.setAttribute("variant", errors ? "negative" : "neutral");
            }
            const counted = tab === "problems" ? `${count} problem${count === 1 ? "" : "s"}` : `${count} new line${count === 1 ? "" : "s"}`;
            root.getElementById(`tab-${tab}`)?.setAttribute("aria-label", visible ? `${label}, ${counted}${errors ? ", with errors" : ""}` : label);
        }
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "guide-tabs": GuideTabs;
    }
    interface HTMLElementEventMap extends GuideTabsEvents {}
}
