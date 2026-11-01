// © 2026 Adobe. MIT License. See /LICENSE for details.
import { gpuDevice, Mat4x4, System, World } from "@adobe/ecs";
import { Device, Frame, Surface, Target, View } from "../index.js";

// Draws each view: a pass loading what its target holds, limited to the view's rectangle.
const draw = System.render({ shader: { accessors: {} }, after: [Frame.update], before: [Frame.present] }, ({ encoder }, { resources }) => {
    for (const view of resources[View.states]?.values() ?? []) View.begin(encoder, view).end();
});

const frame = System.create({ systems: [Frame.systems, draw] });

const spawnView = System.create({ components: { with: [Target.size] } }, (row, { commands }) => {
    commands.spawn([View.target, View.viewport, View.projection])({ [View.target]: row.entity, [View.viewport]: [0, 0, 1, 1], [View.projection]: Mat4x4.identity });
});

const updated = System.create({ readonly: true }, ({ resources }) => resources[View.states] !== null);

export const main = async (): Promise<void> => {
    // Null where there's no WebGPU, as in node: the world then draws nothing, and runs the same systems.
    const device = await Device.request();
    const world = World.create({ [gpuDevice]: device });
    // The guide's Output tab has an element #output; elsewhere, as in node, there's none.
    const output = globalThis.document?.querySelector<HTMLElement>("#output") ?? null;
    const canvas = output?.appendChild(document.createElement("canvas")) ?? null;
    if (canvas !== null) {
        const surface = await world.run(Surface.attach, { canvas: canvas.transferControlToOffscreen(), width: canvas.clientWidth, height: canvas.clientHeight, target: { ...Target.Options.default, clear: [0.1, 0.3, 0.6, 1] } });
        Surface.observe(canvas, world, surface);
        await world.run(spawnView);
    }
    console.log("views updated before a frame", await world.run(updated));
    for (let frames = 0; frames < 3; frames++) await world.run(frame);
    console.log("views updated after a frame", await world.run(updated));
};
