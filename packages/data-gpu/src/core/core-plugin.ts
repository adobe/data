// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, scheduler } from "@adobe/data/ecs";
import { FrameTime } from "./frame-time/frame-time.js";

async function getWebGPUDevice() {
    // Guard for headless hosts (Node) where `navigator` doesn't exist: the
    // simulation runs without a GPU device; only rendering needs one.
    if (typeof navigator === "undefined" || !navigator.gpu) {
        return null;
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        return null;
    }
    return adapter.requestDevice();
}

/**
 * GPU runtime + frame scheduler — the shared base for both `graphics`
 * (presentation) and `physics` (compute). Owns the WebGPU device, the
 * per-frame command encoder, and the ordered frame phases. Contains nothing
 * about canvases or render passes — those live in `graphics`.
 *
 * Phase order: input → preUpdate → update → postUpdate → physics → preRender
 * → render → postRender. The command encoder is created at `preUpdate` and
 * submitted at `postRender`; consumers record render passes (graphics) or
 * compute passes (physics) into it during the phases between.
 *
 * Composes `FrameTime` over the scheduler so every downstream system has the
 * `frameTime` resource — per-frame `dt` / `elapsed` — without re-deriving it.
 */
export const core = Database.Plugin.create({
    extends: Database.Plugin.combine(scheduler, FrameTime.plugin),
    resources: {
        device: { default: null as GPUDevice | null, transient: true },
        commandEncoder: { default: null as GPUCommandEncoder | null, transient: true },
    },
    systems: {
        input: {
            create: _db => () => {},
        },
        preUpdate: {
            create: db => () => {
                const { device } = db.store.resources;
                if (device) {
                    db.store.resources.commandEncoder = device.createCommandEncoder();
                }
            },
            schedule: { after: ["input"] },
        },
        update: {
            create: _db => () => {},
            schedule: { after: ["preUpdate"] },
        },
        postUpdate: {
            create: _db => () => {},
            schedule: { after: ["update"] },
        },
        physics: {
            create: _db => () => {},
            schedule: { after: ["postUpdate"] },
        },
        preRender: {
            create: _db => () => {},
            schedule: { after: ["physics"] },
        },
        render: {
            create: db => {
                getWebGPUDevice().then(device => {
                    db.store.resources.device = device;
                });
                return () => {};
            },
            schedule: { after: ["preRender"] },
        },
        // Submits the frame's command encoder. Graphics ends its render pass
        // `before: ["postRender"]` (so the pass is closed first); physics
        // finishes its compute passes during the `physics` phase — both record
        // into this encoder beforehand.
        postRender: {
            create: db => () => {
                const { commandEncoder, device } = db.store.resources;
                if (commandEncoder && device) {
                    device.queue.submit([commandEncoder.finish()]);
                    db.store.resources.commandEncoder = null;
                }
            },
            schedule: { after: ["render"] },
        },
    },
});
