// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System, World } from "../index.js";

const volume = Symbol();
const levels = Symbol();

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

// Runs on audio, where levels lives.
const mix = System.create({ components: { with: [volume] } }, (row, { resources }) => {
    resources[levels] = new Map([...resources[levels], [`voice ${row.entity}`, row[volume]]]);
});

let heard = 0;
const listen = System.create({ observer: true }, ({ resources }) => {
    heard = resources[levels].size;
});

const spawn = System.create(({ commands }) => {
    commands.spawn([volume])({ [volume]: 0.8 });
    commands.spawn([volume])({ [volume]: 0.3 });
});

const countVoices = System.create({ observer: true }, ({ resources }) => resources[levels].size);

/** Waits a turn of the event loop at a time until `done`, for two seconds at most. */
const until = async (done: () => boolean): Promise<void> => {
    const end = performance.now() + 2000;
    while (!done() && performance.now() < end) await new Promise(resolve => setTimeout(resolve, 1));
};

export const main = async (): Promise<void> => {
    // Usually one end of the channel goes to a worker, `new Worker(...)`, which joins with the other.
    const channel = new MessageChannel();
    await using world = World.create();
    // Each side awaits its own end, here both on one thread.
    const [joined] = await Promise.all([
        World.join(channel.port2, { threads: ["audio"] }).then(audio => {
            audio.add(listen);
            return audio;
        }),
        world.share(channel.port1),
    ]);
    await using audio = joined;
    await world.run(spawn);
    await world.run(mix);
    const mixed = await world.run(countVoices);
    await until(() => heard === mixed);
    console.log("mixed", mixed, "voices; listening hears", heard);
    await audio.run(spawn);
    await audio.run(mix);
    const more = await world.run(countVoices);
    await until(() => heard === more);
    console.log("mixed", more, "voices; listening hears", heard);
};
