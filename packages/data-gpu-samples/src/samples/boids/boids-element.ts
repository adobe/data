// © 2026 Adobe. MIT License. See /LICENSE for details.

import { html, css } from "lit";
import { customElement } from "lit/decorators.js";
import { DatabaseElement, useEffect, useElement } from "@adobe/data-lit";
import { boidsPlugin } from "./boids-service.js";
import { useOrbitCameraControl } from "../../hooks/use-orbit-camera-control.js";

const tagName = "boids-sample";

declare global {
    interface HTMLElementTagNameMap {
        [tagName]: BoidsElement;
    }
}

@customElement(tagName)
export class BoidsElement extends DatabaseElement<typeof boidsPlugin> {
    static styles = css`
        :host { display: block; }
        .stage { position: relative; }
        canvas { display: block; border: 1px solid #333; background: #000; cursor: grab; }
        canvas.dragging { cursor: grabbing; }
        .hint { position: absolute; top: 0.5rem; right: 0.5rem; padding: 0.25rem 0.5rem; background: rgba(0,0,0,0.5); color: #aaa; font: 11px/1 ui-monospace, monospace; border-radius: 4px; }
    `;

    get plugin() { return boidsPlugin; }

    override render() {
        const canvas = useElement("canvas");
        const service = this.service;

        useEffect(() => {
            if (!canvas) return;
            service.transactions.setCanvas(canvas);
            service.transactions.setLight({ color: [0.9, 0.9, 0.95] });
            service.transactions.initializeScene();
        }, [canvas, service]);

        // Cursor scare: project the pointer onto the orbit-focal plane and
        // feed it to the compute shader as a fleeing target.
        useEffect(() => {
            if (!canvas) return;
            const onMove = (e: PointerEvent) => {
                const rect = canvas.getBoundingClientRect();
                service.transactions.setScareFromScreen({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                    width: rect.width,
                    height: rect.height,
                });
            };
            const onLeave = () => service.transactions.disableScare();
            canvas.addEventListener("pointermove", onMove);
            canvas.addEventListener("pointerleave", onLeave);
            return () => {
                canvas.removeEventListener("pointermove", onMove);
                canvas.removeEventListener("pointerleave", onLeave);
            };
        }, [canvas, service]);

        useOrbitCameraControl(service);

        return html`
            <div class="stage">
                <canvas width="900" height="600"></canvas>
                <div class="hint">move mouse to scare · drag to orbit</div>
            </div>
        `;
    }
}
