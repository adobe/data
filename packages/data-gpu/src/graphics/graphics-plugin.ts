// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { Vec4 } from "@adobe/data/math";
import { core } from "../core/core-plugin.js";

/**
 * Graphics presentation — extends the `core` GPU runtime with everything
 * about drawing to a canvas: the swap-chain context, color/depth formats,
 * the depth texture, and the per-frame render pass.
 *
 * Render-pass lifecycle, sandwiched between core's phase anchors with hard
 * ordering edges (`during` is only a soft hint, so we use after/before):
 * `beginRenderPass` runs after `preRender` and before `render` (pass open
 * before draws); draw systems run `during: ["render"]`; `endRenderPass` runs
 * after `render` and before `postRender` (pass closed after draws, before
 * core submits the encoder). Compute-only consumers (e.g. `physics`) depend
 * on `core` directly and never touch any of this.
 */
export const graphics = Database.Plugin.create({
    extends: core,
    resources: {
        renderPassEncoder: { default: null as GPURenderPassEncoder | null, transient: true },
        depthTexture: { default: null as GPUTexture | null, transient: true },
        clearColor: { default: [0, 0, 0, 1] as Vec4, transient: true },
        canvas: { default: null as HTMLCanvasElement | null, transient: true },
        canvasContext: { default: null as GPUCanvasContext | null, transient: true },
        canvasFormat: { default: navigator.gpu.getPreferredCanvasFormat(), transient: true },
        depthFormat: { default: "depth24plus" as GPUTextureFormat, transient: true },
    },
    transactions: {
        setCanvas(t, canvas: HTMLCanvasElement | null) {
            t.resources.canvas = canvas;
        },
    },
    systems: {
        configureCanvas: {
            create: db => () => {
                const { device } = db.store.resources;
                if (!device) return;
                let { canvasContext } = db.store.resources;
                const { canvas, canvasFormat } = db.store.resources;
                if (canvas && !canvasContext) {
                    canvasContext = db.store.resources.canvasContext = canvas.getContext("webgpu");
                    if (!canvasContext) {
                        throw new Error("No WebGPU context");
                    }
                    canvasContext.configure({
                        device,
                        format: canvasFormat,
                        alphaMode: "premultiplied",
                    });
                }
            },
            schedule: { after: ["preUpdate"], before: ["update"] },
        },
        beginRenderPass: {
            create: db => () => {
                const { canvas, commandEncoder, clearColor, canvasContext, device, depthFormat } = db.store.resources;
                let { depthTexture } = db.store.resources;
                if (!commandEncoder || !canvasContext || !device || !canvas) return;

                const canvasSize: [number, number] = [canvas.width, canvas.height];
                if (!depthTexture || depthTexture.width !== canvasSize[0] || depthTexture.height !== canvasSize[1]) {
                    depthTexture = db.store.resources.depthTexture = device.createTexture({
                        size: canvasSize,
                        format: depthFormat,
                        usage: GPUTextureUsage.RENDER_ATTACHMENT,
                    });
                }

                db.store.resources.renderPassEncoder = commandEncoder.beginRenderPass({
                    colorAttachments: [{
                        clearValue: clearColor,
                        loadOp: "clear",
                        storeOp: "store",
                        view: canvasContext.getCurrentTexture().createView(),
                    }],
                    depthStencilAttachment: {
                        view: depthTexture.createView(),
                        depthClearValue: 1.0,
                        depthLoadOp: "clear",
                        depthStoreOp: "store",
                    },
                });
            },
            schedule: { after: ["preRender"], before: ["render"] },
        },
        endRenderPass: {
            create: db => () => {
                const { renderPassEncoder } = db.store.resources;
                if (renderPassEncoder) {
                    renderPassEncoder.end();
                    db.store.resources.renderPassEncoder = null;
                }
            },
            schedule: { after: ["render"], before: ["postRender"] },
        },
    },
});
