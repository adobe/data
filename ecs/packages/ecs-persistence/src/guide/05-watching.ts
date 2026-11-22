// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System, World } from "@adobe/ecs";
import { decode, encode, snapshot, spawn, watch } from "../index.js";

/** Saved in the session, kept across reloads, under its name there. */
const session = Symbol();
const label = Symbol();
const filter = Symbol();

declare module "@adobe/ecs" {
    interface Threads {
        page: true;
    }
    interface Traits<N> {
        readonly [session]: string;
    }
    interface Components {
        [label]: { type: string; [session]: "label" };
    }
    interface Resources {
        // Data the page's views read beside their elements, so it lives on the page's thread.
        [filter]: { type: ReadonlyMap<string, string> | null; default: null; thread: "page"; [session]: "filter" };
    }
}

const addLabel = System.create(({ commands }) => { commands.spawn([label])({ [label]: "box" }); });
/** Runs on the page's thread, which holds the filter. */
const filterBoxes = System.create({}, ({ resources }) => { resources[filter] = new Map([...resources[filter] ?? [], ["shape", "box"]]); });
const idle = System.create({}, () => {});
const readFilter = System.create({ readonly: true }, ({ resources }) => [...resources[filter] ?? []].map(([key, value]) => `${key}: ${value}`).join(", "));

/** A world on this thread, with the page's thread joined through a channel, as a worker's world and its page are. */
const open = async (): Promise<{ readonly world: World; readonly page: World }> => {
    const world = World.create();
    const { port1, port2 } = new MessageChannel();
    const shared = world.share(port1);
    const page = await World.join(port2, { threads: ["page"] });
    await shared;
    return { world, page };
};

export const main = async (): Promise<void> => {
    const { world, page } = await open();
    let saved: Uint8Array = new Uint8Array(0);
    let due = false;
    const stop = watch({ world, by: session }, () => { due = true; });
    if (typeof stop !== "function") return console.log(stop.failure);
    /** Saves the session once something it covers changed. */
    const save = async (after: string): Promise<void> => {
        if (!due) return console.log(`${after}: nothing to save`);
        due = false;
        const taken = await snapshot({ world, by: session });
        if (taken.failure !== undefined) return console.log(taken.failure);
        saved = encode(taken);
        console.log(`${after}: saved`);
    };
    await save("started");
    await world.run(addLabel);
    await save("labeled");
    await world.run(idle);
    await save("idle");
    await world.run(filterBoxes);
    await save("filtered on the page");
    stop();
    await page.dispose();
    await world.dispose();

    // Reloaded: the filter goes back to the page's thread.
    const reloaded = await open();
    const read = decode(saved, { by: session });
    if (read.failure !== undefined) return console.log(read.failure);
    const spawned = await spawn({ world: reloaded.world, snapshot: read });
    if (spawned.failure !== undefined) return console.log(spawned.failure);
    console.log("reloaded filter:", await reloaded.page.run(readFilter));
    await reloaded.page.dispose();
    await reloaded.world.dispose();
};
