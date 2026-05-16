// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html, css } from "lit";
import { customElement } from "lit/decorators.js";
import { DatabaseElement, useEffect, useElement } from "@adobe/data-lit";
import { helloTrianglePlugin } from "./hello-triangle-service.js";

const tagName = "hello-triangle";

declare global {
    interface HTMLElementTagNameMap {
        [tagName]: HelloTriangleElement;
    }
}

@customElement(tagName)
export class HelloTriangleElement extends DatabaseElement<typeof helloTrianglePlugin> {
    static styles = css`:host { display: block; } canvas { display: block; border: 1px solid #333; }`;

    get plugin() { return helloTrianglePlugin; }

    override render() {
        const canvas = useElement("canvas");
        const service = this.service;
        useEffect(() => {
            if (!canvas) return;
            service.transactions.setCanvas(canvas);
        }, [canvas, service]);
        return html`<canvas width="800" height="600"></canvas>`;
    }
}
