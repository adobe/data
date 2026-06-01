// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html, css } from "lit";
import { customElement } from "lit/decorators.js";
import { DatabaseElement, useEffect, useElement } from "@adobe/data-lit";
import { physicsDropPlugin } from "./physics-drop-service.js";
import { useOrbitCameraControl } from "../../hooks/use-orbit-camera-control.js";

const tagName = "physics-drop";

declare global {
    interface HTMLElementTagNameMap {
        [tagName]: PhysicsDropElement;
    }
}

@customElement(tagName)
export class PhysicsDropElement extends DatabaseElement<typeof physicsDropPlugin> {
    static styles = css`
        :host { display: block; }
        .stage { position: relative; }
        canvas { display: block; border: 1px solid #333; background: #000; cursor: grab; }
        canvas.dragging { cursor: grabbing; }
        .hint { position: absolute; top: 0.5rem; right: 0.5rem; padding: 0.25rem 0.5rem; background: rgba(0,0,0,0.5); color: #aaa; font: 11px/1 ui-monospace, monospace; border-radius: 4px; }
    `;

    get plugin() { return physicsDropPlugin; }

    override render() {
        const canvas = useElement("canvas");
        const service = this.service;

        useEffect(() => {
            if (!canvas) return;
            service.transactions.setCanvas(canvas);
            service.transactions.initializeScene();
        }, [canvas, service]);

        useOrbitCameraControl(service);

        return html`
            <div class="stage">
                <canvas width="900" height="600"></canvas>
                <div class="hint">spheres, cuboids &amp; sparks · drag to orbit</div>
            </div>
        `;
    }
}
