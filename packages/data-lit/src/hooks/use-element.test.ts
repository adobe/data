// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { LitElement, html, nothing } from "lit";
import { attachDecorator } from "./attach-decorator.js";
import { withHooks } from "./with-hooks.js";
import { useElement } from "./use-element.js";

class SelectorProbe extends LitElement {
    selector = "span";
    shadowMatch = false;
    found: Element | null = null;

    constructor() {
        super();
        attachDecorator(this, "render", withHooks);
    }

    render() {
        this.found = useElement(this.selector);
        return html`${this.shadowMatch ? html`<span class="shadow"></span>` : nothing}<slot></slot>`;
    }
}
customElements.define("use-element-probe", SelectorProbe);

const flushMutations = () => new Promise<void>(resolve => setTimeout(resolve));

async function mount(...children: Element[]): Promise<SelectorProbe> {
    const element = document.createElement("use-element-probe") as SelectorProbe;
    element.append(...children);
    document.body.append(element);
    await element.updateComplete;
    return element;
}

afterEach(async () => {
    document.body.replaceChildren();
    await flushMutations();
});

describe("useElement(selector)", () => {
    it("returns an existing light-DOM match on the first render", async () => {
        const span = document.createElement("span");
        const element = await mount(span);
        expect(element.found).toBe(span);
    });

    it("renders when a match is inserted and when it is removed", async () => {
        const element = await mount();
        expect(element.found).toBeNull();

        const span = document.createElement("span");
        element.append(span);
        await flushMutations();
        await element.updateComplete;
        expect(element.found).toBe(span);

        span.remove();
        await flushMutations();
        await element.updateComplete;
        expect(element.found).toBeNull();
    });

    it("re-queries when the selector changes", async () => {
        const element = await mount(document.createElement("span"));
        element.selector = "button";
        element.requestUpdate();
        await element.updateComplete;
        expect(element.found).toBeNull();
    });

    it("prefers a shadow-root match over a light-DOM match", async () => {
        const light = document.createElement("span");
        const element = document.createElement("use-element-probe") as SelectorProbe;
        element.shadowMatch = true;
        element.append(light);
        document.body.append(element);
        await element.updateComplete;
        await flushMutations();
        await element.updateComplete;
        expect(element.found).toBe(element.shadowRoot?.querySelector(".shadow"));
    });
});
