// © 2026 Adobe. MIT License. See /LICENSE for details.
// Fox glTF © Khronos Group, CC-BY 4.0

import { html, css } from "lit";
import { customElement } from "lit/decorators.js";
import { DatabaseElement, useEffect, useElement } from "@adobe/data-lit";
import { skinnedFoxPlugin } from "./skinned-fox-service.js";
import { useOrbitCameraControl } from "../../hooks/use-orbit-camera-control.js";

const tagName = "skinned-fox";

declare global {
    interface HTMLElementTagNameMap {
        [tagName]: SkinnedFoxElement;
    }
}

const MODEL_URL = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Fox/glTF-Binary/Fox.glb";
const ENV_URL = "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr";

@customElement(tagName)
export class SkinnedFoxElement extends DatabaseElement<typeof skinnedFoxPlugin> {
    static styles = css`
        :host { display: block; }
        .stage { position: relative; }
        canvas { display: block; border: 1px solid #333; background: #111; cursor: grab; }
        canvas.dragging { cursor: grabbing; }
        .hint { position: absolute; top: 0.5rem; right: 0.5rem; padding: 0.25rem 0.5rem; background: rgba(0,0,0,0.5); color: #aaa; font: 11px/1 ui-monospace, monospace; border-radius: 4px; }
    `;

    get plugin() { return skinnedFoxPlugin; }

    override render() {
        const canvas = useElement("canvas");
        const service = this.service;

        useEffect(() => {
            if (!canvas) return;
            service.transactions.setCanvas(canvas);
            service.transactions.initializeScene({
                modelUrl: MODEL_URL,
                envUrl: ENV_URL,
                lightColor: [0.3, 0.3, 0.3],
                orbitFit: { radiusFactor: 1.6, heightFactor: 0.4 },
            });
        }, [canvas, service]);

        useOrbitCameraControl(service);

        return html`
            <div class="stage">
                <canvas width="800" height="600"></canvas>
                <div class="hint">drag to orbit</div>
            </div>
        `;
    }
}
