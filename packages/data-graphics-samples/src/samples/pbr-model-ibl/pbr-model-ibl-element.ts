// © 2026 Adobe. MIT License. See /LICENSE for details.

import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { Vec3 } from "@adobe/data/math";
import { loadGltfModel } from "@adobe/data-graphics";
import { createPbrModelIblService } from "./pbr-model-ibl-service.js";

const tagName = "pbr-model-ibl";

declare global {
    interface HTMLElementTagNameMap {
        [tagName]: PbrModelIblElement;
    }
}

const BASE = import.meta.env.BASE_URL ?? "/";
const MODEL_URL = `${BASE}models/DamagedHelmet.glb`;
const ENV_URL = `${BASE}env/studio_small_09_1k.hdr`;

@customElement(tagName)
export class PbrModelIblElement extends LitElement {
    static styles = css`
        :host { display: block; }
        .stage { position: relative; }
        canvas { display: block; border: 1px solid #333; background: #111; cursor: grab; }
        canvas.dragging { cursor: grabbing; }
        .status { position: absolute; bottom: 0.5rem; left: 0.5rem; padding: 0.25rem 0.5rem; background: rgba(0,0,0,0.6); color: #ddd; font: 12px/1 ui-monospace, monospace; border-radius: 4px; }
        .hint { position: absolute; top: 0.5rem; right: 0.5rem; padding: 0.25rem 0.5rem; background: rgba(0,0,0,0.5); color: #aaa; font: 11px/1 ui-monospace, monospace; border-radius: 4px; }
    `;

    private service = createPbrModelIblService();
    @state() private status = "loading…";
    private dragLastX = 0;
    private dragging = false;

    private onPointerDown = (e: PointerEvent) => {
        const canvas = e.currentTarget as HTMLCanvasElement;
        canvas.setPointerCapture(e.pointerId);
        canvas.classList.add("dragging");
        this.dragging = true;
        this.dragLastX = e.clientX;
    };

    private onPointerMove = (e: PointerEvent) => {
        if (!this.dragging) return;
        const dx = e.clientX - this.dragLastX;
        this.dragLastX = e.clientX;
        this.service.transactions.addOrbitAngle(-dx * 0.01);
    };

    private onPointerUp = (e: PointerEvent) => {
        const canvas = e.currentTarget as HTMLCanvasElement;
        canvas.releasePointerCapture(e.pointerId);
        canvas.classList.remove("dragging");
        this.dragging = false;
    };

    override async firstUpdated() {
        const canvas = this.renderRoot.querySelector("canvas");
        if (!canvas) return;
        canvas.addEventListener("pointerdown", this.onPointerDown);
        canvas.addEventListener("pointermove", this.onPointerMove);
        canvas.addEventListener("pointerup", this.onPointerUp);
        canvas.addEventListener("pointercancel", this.onPointerUp);
        this.service.transactions.setCanvas(canvas);
        this.service.transactions.setIblEnvironmentUrl(ENV_URL);
        this.service.transactions.setLight({ color: [0.4, 0.4, 0.4] });

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
            this.status = `${loaded.primitiveCount} primitive(s) · IBL`;
        } catch (e) {
            console.error("PBR-IBL model load failed", e);
            this.status = `error: ${(e as Error).message}`;
        }
    }

    override render() {
        return html`
            <div class="stage">
                <canvas width="800" height="600"></canvas>
                <div class="status">${this.status}</div>
                <div class="hint">drag to orbit</div>
            </div>
        `;
    }
}
