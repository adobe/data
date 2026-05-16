// © 2026 Adobe. MIT License. See /LICENSE for details.
// AntiqueCamera glTF model © Khronos Group, CC-BY 4.0

import { html, css } from "lit";
import { customElement } from "lit/decorators.js";
import { DatabaseElement, useEffect, useElement } from "@adobe/data-lit";
import { pbrModelIblPlugin } from "../pbr-model-ibl/pbr-model-ibl-service.js";
import { useOrbitDragCamera } from "../../hooks/use-orbit-drag-camera.js";

const tagName = "antique-camera";

declare global {
    interface HTMLElementTagNameMap {
        [tagName]: AntiqueCameraElement;
    }
}

const MODEL_URL = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/AntiqueCamera/glTF-Binary/AntiqueCamera.glb";
const ENV_URL = "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr";

@customElement(tagName)
export class AntiqueCameraElement extends DatabaseElement<typeof pbrModelIblPlugin> {
    static styles = css`
        :host { display: block; }
        .stage { position: relative; }
        canvas { display: block; border: 1px solid #333; background: #111; cursor: grab; }
        canvas.dragging { cursor: grabbing; }
        .hint { position: absolute; top: 0.5rem; right: 0.5rem; padding: 0.25rem 0.5rem; background: rgba(0,0,0,0.5); color: #aaa; font: 11px/1 ui-monospace, monospace; border-radius: 4px; }
    `;

    get plugin() { return pbrModelIblPlugin; }

    override render() {
        const canvas = useElement("canvas");
        const service = this.service;

        useEffect(() => {
            if (!canvas) return;
            service.transactions.setCanvas(canvas);
            service.transactions.initializeScene({
                modelUrl: MODEL_URL,
                envUrl: ENV_URL,
                lightColor: [0.2, 0.2, 0.2],
                orbitFit: { radiusFactor: 1.4, heightFactor: 0.3 },
            });
        }, [canvas, service]);

        useOrbitDragCamera(dx => service.transactions.addOrbitAngle(-dx * 0.01));

        return html`
            <div class="stage">
                <canvas width="800" height="600"></canvas>
                <div class="hint">drag to orbit</div>
            </div>
        `;
    }
}
