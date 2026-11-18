// © 2026 Adobe. MIT License. See /LICENSE for details.
import { always, gpuDevice, Plugin, System, World } from '@adobe/ecs';
import { Device } from '@adobe/ecs-gpu';
import { pointsModel } from '../../points/model/index.js';
import { pointsView } from '../../points/view/index.js';

// The world's worker: a world with a device of its own, drawing every frame, which the page joins through the port it
// sends and tells when it's leaving.

const world = World.create({ [always]: true });
Plugin.start(world, [pointsModel, pointsView]);
const supplied = Device.keep(world);

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

/** The world's device, if it has one. */
const deviceOf: System<void, GPUDevice | null> = System.create(({ resources }) => resources[gpuDevice]);
