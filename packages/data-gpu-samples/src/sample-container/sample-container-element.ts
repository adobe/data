// © 2026 Adobe. MIT License. See /LICENSE for details.

import { LitElement, html, css } from "lit";
import { customElement } from "lit/decorators.js";
import { HelloTriangle } from "../samples/hello-triangle/hello-triangle.js";
import { PbrModelIbl } from "../samples/pbr-model-ibl/pbr-model-ibl.js";
import { MetalRoughSpheres } from "../samples/metal-rough-spheres/metal-rough-spheres.js";
import { PbrIblInstanced } from "../samples/pbr-ibl-instanced/pbr-ibl-instanced.js";
import { SolarSystem } from "../samples/solar-system/solar-system.js";
import { AntiqueCamera } from "../samples/antique-camera/antique-camera.js";
import { SkinnedFox } from "../samples/skinned-fox/skinned-fox.js";
import { Boids } from "../samples/boids/boids.js";

const tagName = "sample-container";

declare global {
    interface HTMLElementTagNameMap {
        [tagName]: SampleContainerElement;
    }
}

@customElement(tagName)
export class SampleContainerElement extends LitElement {
    static styles = css`
        :host { display: block; width: 100%; }
        nav { display: flex; gap: 0.5rem; padding: 1rem; flex-wrap: wrap; }
        a { color: #7af; text-decoration: none; padding: 0.25rem 0.75rem; border: 1px solid #7af; border-radius: 4px; }
        a:hover { background: #7af2; }
        .content { padding: 1rem; }
    `;

    private get sample(): string {
        return new URLSearchParams(window.location.search).get("sample") ?? "hello-triangle";
    }

    override render() {
        const samples = ["hello-triangle", "pbr-model-ibl", "metal-rough-spheres", "pbr-ibl-instanced", "solar-system", "antique-camera", "skinned-fox", "boids"];
        return html`
            <nav>
                ${samples.map(s => html`<a href="?sample=${s}">${s}</a>`)}
            </nav>
            <div class="content">
                ${this.sample === "hello-triangle" ? HelloTriangle() : ""}
                ${this.sample === "pbr-model-ibl" ? PbrModelIbl() : ""}
                ${this.sample === "metal-rough-spheres" ? MetalRoughSpheres() : ""}
                ${this.sample === "pbr-ibl-instanced" ? PbrIblInstanced() : ""}
                ${this.sample === "solar-system" ? SolarSystem() : ""}
                ${this.sample === "antique-camera" ? AntiqueCamera() : ""}
                ${this.sample === "skinned-fox" ? SkinnedFox() : ""}
                ${this.sample === "boids" ? Boids() : ""}
            </div>
        `;
    }
}
