// © 2026 Adobe. MIT License. See /LICENSE for details.

import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { Vec3 } from "@adobe/data/math";
import { loadGltfModel } from "@adobe/data-graphics";
import { createPbrModelService } from "./pbr-model-service.js";

const tagName = "pbr-model";

declare global {
    interface HTMLElementTagNameMap {
        [tagName]: PbrModelElement;
    }
}

const MODEL_URL = `${import.meta.env.BASE_URL ?? "/"}models/DamagedHelmet.glb`;

@customElement(tagName)
export class PbrModelElement extends LitElement {
    static styles = css`
        :host { display: block; }
        .stage { position: relative; }
        canvas { display: block; border: 1px solid #333; background: #111; }
        .status { position: absolute; bottom: 0.5rem; left: 0.5rem; padding: 0.25rem 0.5rem; background: rgba(0,0,0,0.6); color: #ddd; font: 12px/1 ui-monospace, monospace; border-radius: 4px; }
    `;

    private service = createPbrModelService();
    @state() private status = "loading…";

    override async firstUpdated() {
        const canvas = this.renderRoot.querySelector("canvas");
        if (!canvas) return;
        this.service.transactions.setCanvas(canvas);

        try {
            const loaded = await loadGltfModel(this.service, MODEL_URL);
            const center: Vec3 = [
                (loaded.boundsMin[0] + loaded.boundsMax[0]) / 2,
                (loaded.boundsMin[1] + loaded.boundsMax[1]) / 2,
                (loaded.boundsMin[2] + loaded.boundsMax[2]) / 2,
            ];
            const size = Math.max(
                loaded.boundsMax[0] - loaded.boundsMin[0],
                loaded.boundsMax[1] - loaded.boundsMin[1],
                loaded.boundsMax[2] - loaded.boundsMin[2],
            );
            this.service.transactions.setOrbit({
                center,
                radius: size * 1.6,
                height: size * 0.25,
            });
            this.status = `${loaded.primitiveCount} primitive(s)`;
        } catch (e) {
            console.error("PBR model load failed", e);
            this.status = `error: ${(e as Error).message}`;
        }
    }

    override render() {
        return html`
            <div class="stage">
                <canvas width="800" height="600"></canvas>
                <div class="status">${this.status}</div>
            </div>
        `;
    }
}
