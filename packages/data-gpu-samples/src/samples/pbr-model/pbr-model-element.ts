// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html, css } from "lit";
import { customElement } from "lit/decorators.js";
import { DatabaseElement, useEffect, useElement } from "@adobe/data-lit";
import { pbrModelPlugin } from "./pbr-model-service.js";

const tagName = "pbr-model";

declare global {
    interface HTMLElementTagNameMap {
        [tagName]: PbrModelElement;
    }
}

const MODEL_URL = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb";

@customElement(tagName)
export class PbrModelElement extends DatabaseElement<typeof pbrModelPlugin> {
    static styles = css`
        :host { display: block; }
        .stage { position: relative; }
        canvas { display: block; border: 1px solid #333; background: #111; }
    `;

    get plugin() { return pbrModelPlugin; }

    override render() {
        const canvas = useElement("canvas");
        const service = this.service;
        useEffect(() => {
            if (!canvas) return;
            service.transactions.setCanvas(canvas);
            service.transactions.initializeScene({
                modelUrl: MODEL_URL,
                orbitFit: { radiusFactor: 1.6, heightFactor: 0.25 },
            });
        }, [canvas, service]);
        return html`
            <div class="stage">
                <canvas width="800" height="600"></canvas>
            </div>
        `;
    }
}
