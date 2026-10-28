// © 2026 Adobe. MIT License. See /LICENSE for details.
import { always, gpuDevice, System, World } from '@adobe/ecs';
import { Device } from '@adobe/ecs-gpu';
import { frame } from './scene.js';

// The world, on a worker, with a device of its own, drawing every frame; the page joins it through the port it sends,
// and tells it when it's leaving.

const world = World.create({ [always]: true });
world.add(frame);
const supplied = Device.keep(world);

const deviceOf = System.create(({ resources }) => resources[gpuDevice]);

/** Stops supplying devices, disposes the world, which releases its surfaces and targets, then destroys its device. */
const leave = async (): Promise<void> => {
    const { stop } = await supplied;
    stop();
    const device = await world.run(deviceOf);
    await world.dispose();
    device?.destroy();
    self.postMessage({ left: true });
};

self.onmessage = (event: MessageEvent<unknown>) => {
    const data: unknown = event.data;
    if (typeof data !== "object" || data === null) return;
    if (Reflect.get(data, "leave") === true) {
        void leave().catch((error: unknown) => console.error("The world didn't shut down:", error));
        return;
    }
    const port: unknown = Reflect.get(data, "port");
    // A thread that couldn't join says why here.
    if (port instanceof MessagePort) void supplied.then(() => world.share(port)).catch((error: unknown) => console.error("The page couldn't join the world:", error));
};
