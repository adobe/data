/*MIT License

© Copyright 2025 Adobe. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.*/

import { describe, it } from "vitest";
import { createPlugin } from "./create-plugin.js";
import { scheduler } from "../plugins/scheduler/scheduler.js";
import { Vec4 } from "../../math/index.js";
import { Database } from "./database.js";

export const graphicsPlugin = createPlugin({
    components: {
        foo: Vec4.schema,
    },
    resources: {
        device: { default: null as GPUDevice | null, transient: true },
        commandEncoder: { default: null as GPUCommandEncoder | null, transient: true },
        renderPassEncoder: { default: null as GPURenderPassEncoder | null, transient: true },
        depthTexture: { default: null as GPUTexture | null, transient: true },
        clearColor: { default: [0, 0, 0, 1] as Vec4, transient: true },
        canvas: { default: null as HTMLCanvasElement | null, transient: true },
        canvasContext: { default: null as GPUCanvasContext | null, transient: true },
    },
    systems: {
        input: {
            create: db => () => {}
        },
        preUpdate: {
            create: db => () => {
                const { device } = db.store.resources;
                if (device) {
                    db.store.resources.commandEncoder = device.createCommandEncoder();
                    let { canvas, canvasContext } = db.store.resources;
                    if (canvas && !canvasContext) {
                        canvasContext = db.store.resources.canvasContext = canvas.getContext('webgpu');
                        if (!canvasContext) {
                            throw new Error('No WebGPU context');
                        }
                        canvasContext.configure({
                            device,
                            format: navigator.gpu.getPreferredCanvasFormat(),
                            alphaMode: 'premultiplied',
                        });
                    }
                }
            }
        },
        update: {
            create: db => () => {
            }
        },
        postUpdate: {
            create: db => () => {
            }
        },
        physics: {
            create: db => () => {}
        },
        preRender: {
            create: db => () => {
                let { canvas, commandEncoder, clearColor, canvasContext, device, depthTexture } = db.store.resources;
                if (!commandEncoder || !canvasContext || !device || !canvas) return;
                if (!depthTexture) {
                    depthTexture = db.store.resources.depthTexture = device.createTexture({
                        size: [canvas.width, canvas.height],
                        format: 'depth24plus',
                        usage: GPUTextureUsage.RENDER_ATTACHMENT
                    });
                }
                db.store.resources.renderPassEncoder = commandEncoder.beginRenderPass({
                    colorAttachments: [{
                        clearValue: clearColor,
                        loadOp: 'clear',
                        storeOp: 'store',
                        view: canvasContext.getCurrentTexture().createView(),
                    }],
                    depthStencilAttachment: {
                        view: depthTexture.createView(),
                        depthClearValue: 1.0,
                        depthLoadOp: 'clear',
                        depthStoreOp: 'store',
                    }
                });
            }
        },
        render: {
            create: db =>  { return () => { } }
        },
        postRender: {
            create: db => () => {
                const { commandEncoder, renderPassEncoder } = db.store.resources;
                if (renderPassEncoder) {
                    renderPassEncoder.end();
                    db.store.resources.renderPassEncoder = null;
                }
                if (commandEncoder) {
                    commandEncoder.finish();
                    db.store.resources.commandEncoder = null;
                }
            }
        }
    }
},
[
    scheduler
]
)
// type checks
function typeCheck() {
    const database = Database.create(graphicsPlugin);
    // @ts -expect-error - bar does not exist, should error
    database.componentSchemas.bar;

    // this should be fine.
    database.componentSchemas.foo;
}

describe("Database.Plugin.create", () => {
    it("should create a property typed graphics plugin", () => {
        // only compile time checks.
    });
});

