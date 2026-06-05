// © 2026 Adobe. MIT License. See /LICENSE for details.
// CesiumMan glTF © Cesium / Khronos Group, CC-BY 4.0

import { html, css } from "lit";
import { customElement } from "lit/decorators.js";
import { DatabaseElement, useEffect, useElement } from "@adobe/data-lit";
import { ragdollPlugin } from "./ragdoll-service.js";
import { useOrbitCameraControl } from "../../hooks/use-orbit-camera-control.js";

const tagName = "ragdoll-sample";

declare global {
    interface HTMLElementTagNameMap {
        [tagName]: RagdollElement;
    }
}

// A rigged, walking humanoid; CC-BY 4.0.
const MODEL_URL = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CesiumMan/glTF-Binary/CesiumMan.glb";
const ENV_URL = "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr";

@customElement(tagName)
export class RagdollElement extends DatabaseElement<typeof ragdollPlugin> {
    static styles = css`
        :host { display: block; }
        .stage { position: relative; }
        canvas { display: block; border: 1px solid #333; background: #111; cursor: grab; }
        canvas.dragging { cursor: grabbing; }
        .hint { position: absolute; top: 0.5rem; right: 0.5rem; padding: 0.25rem 0.5rem; background: rgba(0,0,0,0.5); color: #aaa; font: 11px/1 ui-monospace, monospace; border-radius: 4px; }
    `;

    get plugin() { return ragdollPlugin; }

    override render() {
        const canvas = useElement("canvas");
        const service = this.service;

        useEffect(() => {
            if (!canvas) return;
            service.transactions.setCanvas(canvas);
            service.transactions.seedStandardMaterials();
            service.transactions.initializeScene({ modelUrl: MODEL_URL, envUrl: ENV_URL });
        }, [canvas, service]);

        useOrbitCameraControl(service);

        return html`
            <div class="stage">
                <canvas width="800" height="600"></canvas>
                <div class="hint">per-bone capsules tracking the walk · drag to orbit</div>
            </div>
        `;
    }
}
