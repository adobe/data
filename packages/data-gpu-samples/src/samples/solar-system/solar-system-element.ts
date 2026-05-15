// © 2026 Adobe. MIT License. See /LICENSE for details.

import { LitElement, html, css } from "lit";
import { customElement } from "lit/decorators.js";
import { createSolarSystemService } from "./solar-system-service.js";

const tagName = "solar-system";

declare global {
    interface HTMLElementTagNameMap {
        [tagName]: SolarSystemElement;
    }
}

const ENV_URL = "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr";

@customElement(tagName)
export class SolarSystemElement extends LitElement {
    static styles = css`
        :host { display: block; }
        .stage { position: relative; }
        canvas { display: block; border: 1px solid #333; background: #000; cursor: grab; }
        canvas.dragging { cursor: grabbing; }
        .hint { position: absolute; top: 0.5rem; right: 0.5rem; padding: 0.25rem 0.5rem; background: rgba(0,0,0,0.5); color: #aaa; font: 11px/1 ui-monospace, monospace; border-radius: 4px; }
    `;

    private service = createSolarSystemService();
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
        this.service.transactions.addCameraAngle(-dx * 0.01);
    };

    private onPointerUp = (e: PointerEvent) => {
        const canvas = e.currentTarget as HTMLCanvasElement;
        canvas.releasePointerCapture(e.pointerId);
        canvas.classList.remove("dragging");
        this.dragging = false;
        this.service.transactions.releaseDrag();
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
        this.service.transactions.setLight({ color: [0.1, 0.1, 0.1] });

        const sunGeoId = this.service.transactions.insertSphere({
            color: [1.0, 0.92, 0.6, 1.0],
            emissive: [3.0, 2.5, 0.8],
            metallic: 0,
            roughness: 1.0,
        });
        const sunModelId = this.service.transactions.insertModel({
            pbrGeometryRef: sunGeoId,
            position: [0, 0, 0],
            scale: [2.5, 2.5, 2.5],
        });

        const mercuryGeoId = this.service.transactions.insertSphere({
            color: [0.55, 0.5, 0.45, 1.0],
            metallic: 0.1,
            roughness: 0.9,
        });
        const mercuryModelId = this.service.transactions.insertModel({
            pbrGeometryRef: mercuryGeoId,
            position: [4.5, 0, 0],
            scale: [0.25, 0.25, 0.25],
            parent: sunModelId,
        });

        const venusGeoId = this.service.transactions.insertSphere({
            color: [0.9, 0.75, 0.4, 1.0],
            metallic: 0.0,
            roughness: 0.95,
        });
        const venusModelId = this.service.transactions.insertModel({
            pbrGeometryRef: venusGeoId,
            position: [7, 0, 0],
            scale: [0.5, 0.5, 0.5],
            parent: sunModelId,
        });

        const earthGeoId = this.service.transactions.insertSphere({
            color: [0.15, 0.45, 0.85, 1.0],
            metallic: 0.05,
            roughness: 0.85,
        });
        const earthModelId = this.service.transactions.insertModel({
            pbrGeometryRef: earthGeoId,
            position: [10, 0, 0],
            scale: [0.55, 0.55, 0.55],
            parent: sunModelId,
        });

        const moonGeoId = this.service.transactions.insertSphere({
            color: [0.65, 0.65, 0.65, 1.0],
            metallic: 0.0,
            roughness: 0.95,
        });
        const moonModelId = this.service.transactions.insertModel({
            pbrGeometryRef: moonGeoId,
            position: [1.2, 0, 0],
            scale: [0.15, 0.15, 0.15],
            parent: earthModelId,
        });

        const marsGeoId = this.service.transactions.insertSphere({
            color: [0.82, 0.32, 0.18, 1.0],
            metallic: 0.1,
            roughness: 0.9,
        });
        const marsModelId = this.service.transactions.insertModel({
            pbrGeometryRef: marsGeoId,
            position: [14, 0, 0],
            scale: [0.4, 0.4, 0.4],
            parent: sunModelId,
        });

        this.service.transactions.addOrbit({ entityId: mercuryModelId, radius: 4.5, speed: 4.0 });
        this.service.transactions.addOrbit({ entityId: venusModelId,   radius: 7.0, speed: 1.6 });
        this.service.transactions.addOrbit({ entityId: earthModelId,   radius: 10.0, speed: 1.0 });
        this.service.transactions.addOrbit({ entityId: moonModelId,    radius: 1.2, speed: 13.4 });
        this.service.transactions.addOrbit({ entityId: marsModelId,    radius: 14.0, speed: 0.53 });

        void sunGeoId; void sunModelId; void moonGeoId;
        void mercuryGeoId; void venusGeoId; void earthGeoId; void marsGeoId;
    }

    override render() {
        return html`
            <div class="stage">
                <canvas width="900" height="600"></canvas>
                <div class="hint">drag to orbit</div>
            </div>
        `;
    }
}
