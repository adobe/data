import { World, always } from '../../index.js';
import { frame } from './sprites.js';

// The world, on a worker: main and the loader join it through the ports main sends, and it draws every frame.

const world = World.create({ [always]: true });
world.add(frame);
self.onmessage = (event: MessageEvent<unknown>) => {
    const ports: unknown = typeof event.data === "object" && event.data !== null ? Reflect.get(event.data, "ports") : null;
    if (Array.isArray(ports)) for (const port of ports) if (port instanceof MessagePort) world.share(port);
};
