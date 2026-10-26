// © 2026 Adobe. MIT License. See /LICENSE for details.
import { World, always } from '@adobe/ecs';
import { frame } from './sprites.js';

// The world, on a worker: main and the loader join it through the ports main sends, and it draws every frame.

const world = World.create({ [always]: true });
world.add(frame);
self.onmessage = (event: MessageEvent<unknown>) => {
    const ports: unknown = typeof event.data === "object" && event.data !== null ? Reflect.get(event.data, "ports") : null;
    // A thread that couldn't join says why here.
    if (Array.isArray(ports)) for (const port of ports) if (port instanceof MessagePort) world.share(port).catch((error: unknown) => console.error("A thread couldn't join the world:", error));
};
