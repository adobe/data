// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Plugin, World } from '@adobe/ecs';
import { spritesPorts } from '../../sprites/ports/index.js';

// The loader's worker, which the page starts: it joins the world through the port the page sends and loads the
// sprites' textures there.

self.onmessage = (event: MessageEvent<unknown>) => {
    const port: unknown = typeof event.data === "object" && event.data !== null ? Reflect.get(event.data, "port") : null;
    if (port instanceof MessagePort) void World.join(port).then(world => Plugin.start(world, [spritesPorts]));
};
