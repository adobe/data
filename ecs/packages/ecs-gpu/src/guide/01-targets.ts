// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Entity, Mat4x4, System, World } from "@adobe/ecs";
import { Target, View } from "../index.js";

let screen = Entity.none;

const spawnScreen = System.create(({ commands }) => {
    screen = commands.spawn([Target.options, Target.size])({ [Target.options]: { ...Target.Options.default, sampleCount: 4 }, [Target.size]: [800, 600] });
    commands.spawn([View.target, View.viewport, View.projection])({ [View.target]: screen, [View.viewport]: [0, 0, 0.5, 1], [View.projection]: Mat4x4.identity });
    commands.spawn([View.target, View.viewport, View.projection])({ [View.target]: screen, [View.viewport]: [0.5, 0, 0.5, 1], [View.projection]: Mat4x4.identity });
});

const listTargets = System.create({ readonly: true, components: { with: [Target.options, Target.size] } }, row => {
    console.log("target", row[Target.size], "samples", row[Target.options].sampleCount);
});

const listViews = System.create({ readonly: true, components: { with: [View.target, View.viewport] } }, row => {
    console.log("view of", row[View.target] === screen ? "screen" : "another", "at", row[View.viewport]);
});

let views = 0;
const countViews = System.create({ readonly: true, components: { with: [View.target] } }, () => {
    views += 1;
});

const removeScreen = System.create(({ commands }) => {
    commands.despawn(screen);
});

export const main = async (): Promise<void> => {
    await using world = World.create();
    await world.run(spawnScreen);
    await world.run(listTargets);
    await world.run(listViews);
    console.log(View.wgsl(1).split("\n")[1]);
    // Its views go with it: each view's target owns it.
    await world.run(removeScreen);
    await world.run(countViews);
    console.log("views left after the screen went:", views);
};
