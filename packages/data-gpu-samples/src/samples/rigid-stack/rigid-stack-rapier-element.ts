// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html, css } from "lit";
import { customElement } from "lit/decorators.js";
import { DatabaseElement, useEffect, useElement } from "@adobe/data-lit";
import { rigidStackRapierPlugin } from "./rigid-stack-service.js";
import { useOrbitCameraControl } from "../../hooks/use-orbit-camera-control.js";

const tagName = "rigid-stack-rapier";

declare global {
    interface HTMLElementTagNameMap {
        [tagName]: RigidStackRapierElement;
    }
}

/** Same scene + render path as the CPU element, driven by the Rapier solver
 *  plugin instead — the side-by-side reference. */
@customElement(tagName)
export class RigidStackRapierElement extends DatabaseElement<typeof rigidStackRapierPlugin> {
    static styles = css`
        :host { display: block; }
        .stage { position: relative; }
        canvas { display: block; border: 1px solid #333; background: #000; cursor: grab; }
        canvas.dragging { cursor: grabbing; }
        .hint { position: absolute; top: 0.5rem; left: 0.5rem; padding: 0.25rem 0.5rem; background: rgba(0,0,0,0.5); color: #aaa; font: 11px/1 ui-monospace, monospace; border-radius: 4px; }
    `;

    get plugin() { return rigidStackRapierPlugin; }

    override render() {
        const canvas = useElement("canvas");
        const service = this.service;

        useEffect(() => {
            if (!canvas) return;
            service.transactions.setCanvas(canvas);
            service.transactions.seedStandardMaterials();
            service.transactions.initializeScene();
        }, [canvas, service]);

        useOrbitCameraControl(service);

        return html`
            <div class="stage">
                <canvas width="460" height="560"></canvas>
                <div class="hint">Rapier (reference) · drag to orbit</div>
            </div>
        `;
    }
}
