// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { System, World } from "../index.js";

const volume = Symbol();
const levels = Symbol();

// A logical thread is where objects live and the code touching them runs. Declare one, and place objects on it.
declare module "@adobe/ecs" {
    interface Threads {
        audio: true;
    }
    interface Components {
        [volume]: { type: number };
    }
    interface Resources {
        [levels]: { type: ReadonlyMap<string, number>; thread: "audio" };
    }
}

// A system runs on the thread its objects live on: this one, writing levels, runs on audio.
const mix = System.create({ components: { with: [volume] } }, (row, { resources }) => {
    resources[levels] = new Map([...resources[levels], [`voice ${row.entity}`, row[volume]]]);
});

// Another thread joins a shared world, claiming the threads it fills, and adds observer systems that run there after
// the world's sync points.
const heard: number[] = [];
const listen = System.create({ observer: true }, ({ resources }) => {
    heard.push(resources[levels].size);
});

const spawn = System.create(({ commands }) => {
    commands.spawn([volume])({ [volume]: 0.8 });
    commands.spawn([volume])({ [volume]: 0.3 });
});

/** Waits a turn of the event loop at a time until `done`. */
const until = async (done: () => boolean): Promise<void> => {
    while (!done()) await new Promise(resolve => setTimeout(resolve, 1));
};

it("shares a world with another thread", async () => {
    // Usually one end of the channel goes to a worker, `new Worker(...)`, which joins with the other.
    const channel = new MessageChannel();
    await using world = World.create();
    world.share(channel.port1);
    await using audio = World.join(channel.port2, { threads: ["audio"] });
    audio.add(listen);
    await world.run(spawn);
    // A joined world runs systems as the world does.
    await audio.run(mix);
    await until(() => heard.at(-1) === 2);
    expect(heard.at(-1)).toBe(2);
});
