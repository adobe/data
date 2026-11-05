// © 2026 Adobe. MIT License. See /LICENSE for details.
import { World } from '@adobe/ecs';
import { loadSprites } from '../features/sprites/ports/index.js';

// The loader, on a worker: it joins the world through the port main sends and loads the sprites' textures.

self.onmessage = (event: MessageEvent<unknown>) => {
    const port: unknown = typeof event.data === "object" && event.data !== null ? Reflect.get(event.data, "port") : null;
    if (port instanceof MessagePort) void World.join(port).then(loadSprites);
};
