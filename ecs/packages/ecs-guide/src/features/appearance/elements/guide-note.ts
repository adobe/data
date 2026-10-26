// © 2026 Adobe. MIT License. See /LICENSE for details.
/**
 * `<guide-note>`: says whether this browser has WebGPU, for the chapter on GPU kernels. `webgpu` is what the page
 * found; `hidden` hides it, as it does any element.
 */

export type WebgpuSupport = "checking" | "available" | "unavailable";

const template = document.createElement("template");
template.innerHTML = `
<style>
    :host { display: block; padding: var(--spectrum-spacing-100, 8px) var(--spectrum-spacing-300, 16px); border-bottom: 1px solid var(--spectrum-gray-200);
        font: var(--spectrum-font-size-75, 12px)/1.4 var(--spectrum-sans-font-family-stack, system-ui, sans-serif); }
    :host([hidden]) { display: none; }
</style>
<sp-status-light size="s" variant="neutral"></sp-status-light>`;

const texts: { readonly [S in WebgpuSupport]: { readonly variant: string; readonly text: string } } = {
    checking: { variant: "neutral", text: "Checking whether this browser has WebGPU…" },
    available: { variant: "positive", text: "This browser has WebGPU. The example's world has no device, so its GPU kernel runs on the CPU; give one with World.create({ [gpuDevice]: device }) to run it on the GPU." },
    unavailable: { variant: "notice", text: "This browser has no WebGPU, so GPU kernels run on the CPU and render systems are skipped. The example runs either way." },
};

export class GuideNote extends HTMLElement {
    readonly #light: HTMLElement;
    #webgpu: WebgpuSupport = "checking";

    constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.append(template.content.cloneNode(true));
        const light = root.querySelector("sp-status-light");
        if (!(light instanceof HTMLElement)) throw new Error("guide-note's template is missing its light.");
        this.#light = light;
        this.#render();
    }

    get webgpu(): WebgpuSupport {
        return this.#webgpu;
    }

    set webgpu(value: WebgpuSupport) {
        if (value === this.#webgpu) return;
        this.#webgpu = value;
        this.#render();
    }

    #render(): void {
        const { variant, text } = texts[this.#webgpu];
        this.#light.setAttribute("variant", variant);
        this.#light.textContent = text;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "guide-note": GuideNote;
    }
}
