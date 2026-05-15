// © 2026 Adobe. MIT License. See /LICENSE for details.

import { LitElement, html, css } from "lit";
import { customElement } from "lit/decorators.js";
import { createHelloTriangleService } from "./hello-triangle-service.js";

const tagName = "hello-triangle";

declare global {
    interface HTMLElementTagNameMap {
        [tagName]: HelloTriangleElement;
    }
}

@customElement(tagName)
export class HelloTriangleElement extends LitElement {
    static styles = css`:host { display: block; } canvas { display: block; border: 1px solid #333; }`;

    private service = createHelloTriangleService();

    override firstUpdated() {
        const canvas = this.renderRoot.querySelector("canvas");
        if (canvas) this.service.transactions.setCanvas(canvas);
    }

    override render() {
        return html`<canvas width="800" height="600"></canvas>`;
    }
}
