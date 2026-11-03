// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Plugin, System, World } from "../index.js";

const clicks = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [clicks]: { type: number };
    }
    interface PluginConfig {
        // What a plugin listening for clicks listens on.
        surface: EventTarget;
    }
}

const click = System.create({}, ({ resources }) => {
    resources[clicks] += 1;
});
const readClicks = System.create({ readonly: true }, ({ resources }) => resources[clicks]);

// Runs `click` for each click on the surface, while connected.
const clicking: Plugin<"surface"> = {
    systems: [],
    connect: (world, { surface }) => {
        const listener = (): void => void world.run(click);
        surface.addEventListener("click", listener);
        return () => surface.removeEventListener("click", listener);
    },
};

// Prints the count after each run that changed it.
const report = System.create({ readonly: true, resources: { changed: [clicks] } }, ({ resources }) => {
    console.log("clicks", resources[clicks]);
});
const reporting: Plugin = { systems: [report] };

export const main = async (): Promise<void> => {
    await using world = World.create();
    const surface = new EventTarget();
    {
        using _started = Plugin.start(world, [clicking, reporting], { surface });
        surface.dispatchEvent(new Event("click"));
        surface.dispatchEvent(new Event("click"));
        await world.run(readClicks);
    }
    surface.dispatchEvent(new Event("click"));
    console.log("once stopped", await world.run(readClicks));
};
