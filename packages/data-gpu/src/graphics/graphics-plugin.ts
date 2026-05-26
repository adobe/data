// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, scheduler } from "@adobe/data/ecs";
import { Vec4 } from "@adobe/data/math";

async function getWebGPUDevice() {
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) {
        return null;
    }
    const device = await adapter.requestDevice();
    return device;
}

export const graphics = Database.Plugin.create({
    extends: scheduler,
    resources: {
        device: { default: null as GPUDevice | null, transient: true },
        commandEncoder: { default: null as GPUCommandEncoder | null, transient: true },
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
        }
    },
    systems: {
        input: {
            create: _db => () => {}
        },
        preUpdate: {
            create: db => () => {
                const { device } = db.store.resources;
                if (device) {
                    db.store.resources.commandEncoder = device.createCommandEncoder();
                    let { canvas, canvasContext, canvasFormat } = db.store.resources;
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
                }
            },
            schedule: { after: ["input"] }
        },
        update: {
            create: _db => () => {},
            schedule: { after: ["preUpdate"] }
        },
        postUpdate: {
            create: _db => () => {},
            schedule: { after: ["update"] }
        },
        physics: {
            create: _db => () => {},
            schedule: { after: ["postUpdate"] }
        },
        preRender: {
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
            schedule: { after: ["physics"] }
        },
        render: {
            create: db => {
                getWebGPUDevice().then(device => {
                    db.store.resources.device = device;
                });
                return () => {};
            },
            schedule: { after: ["preRender"] }
        },
        postRender: {
            create: db => () => {
                const { commandEncoder, renderPassEncoder, device } = db.store.resources;
                if (renderPassEncoder) {
                    renderPassEncoder.end();
                    db.store.resources.renderPassEncoder = null;
                }
                if (commandEncoder && device) {
                    device.queue.submit([commandEncoder.finish()]);
                    db.store.resources.commandEncoder = null;
                }
            },
            schedule: { after: ["render"] }
        },
    },
});
