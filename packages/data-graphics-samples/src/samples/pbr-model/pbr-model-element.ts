// © 2026 Adobe. MIT License. See /LICENSE for details.

import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { Aabb } from "@adobe/data/math";
import { createPbrModelService } from "./pbr-model-service.js";

const tagName = "pbr-model";

declare global {
    interface HTMLElementTagNameMap {
        [tagName]: PbrModelElement;
    }
}

const MODEL_URL = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb";

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

    override firstUpdated() {
        const canvas = this.renderRoot.querySelector("canvas");
        if (!canvas) return;
        this.service.transactions.setCanvas(canvas);

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
            this.status = "ready";
        });
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
