// © 2026 Adobe. MIT License. See /LICENSE for details.
import { always, World, workers } from "@adobe/ecs";
import * as Device from "../device/public.js";
import * as Frame from "../frame/public.js";
// The systems the page runs here.
import "../test-systems.test-helper.js";

// A world on this worker, with a device of its own, presenting every frame; the page joins it through the port it sends.

const world = World.create({ [workers]: 0, [always]: true });
world.add(Frame.systems);
const supplied = Device.keep(world);
self.onmessage = (event: MessageEvent<unknown>) => {
    const port: unknown = typeof event.data === "object" && event.data !== null ? Reflect.get(event.data, "port") : null;
    if (port instanceof MessagePort) void supplied.then(() => world.share(port)).catch(reportError);
};
