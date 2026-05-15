// © 2026 Adobe. MIT License. See /LICENSE for details.

import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { Aabb } from "@adobe/data/math";
import { createPbrModelIblService } from "./pbr-model-ibl-service.js";

const tagName = "pbr-model-ibl";

declare global {
    interface HTMLElementTagNameMap {
        [tagName]: PbrModelIblElement;
    }
}

const MODEL_URL = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb";
const ENV_URL = "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr";

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

    override firstUpdated() {
        const canvas = this.renderRoot.querySelector("canvas");
        if (!canvas) return;
        canvas.addEventListener("pointerdown", this.onPointerDown);
        canvas.addEventListener("pointermove", this.onPointerMove);
        canvas.addEventListener("pointerup", this.onPointerUp);
        canvas.addEventListener("pointercancel", this.onPointerUp);
        this.service.transactions.setCanvas(canvas);
        this.service.transactions.setIblEnvironmentUrl(ENV_URL);
        this.service.transactions.setLight({ color: [0.4, 0.4, 0.4] });

        const geoId = this.service.transactions.insertGeometry({ pbrModelUrl: MODEL_URL });
        this.service.transactions.insertModel({ pbrGeometryRef: geoId });

        const unsub = this.service.observe.entity(geoId)((values: unknown) => {
            const bounds = (values as Record<string, unknown> | null)?.pbrModelBounds as Aabb | undefined;
            if (!bounds) return;
            unsub();
            const size = Math.max(
                bounds.max[0] - bounds.min[0],
                bounds.max[1] - bounds.min[1],
                bounds.max[2] - bounds.min[2],
            );
            this.service.transactions.setOrbit({
                center: [
                    (bounds.min[0] + bounds.max[0]) / 2,
                    (bounds.min[1] + bounds.max[1]) / 2,
                    (bounds.min[2] + bounds.max[2]) / 2,
                ],
                radius: size * 1.6,
                height: size * 0.25,
            });
            this.status = "IBL";
        });
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
