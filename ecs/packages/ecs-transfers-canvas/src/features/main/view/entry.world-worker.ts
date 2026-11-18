// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Plugin, World, always } from '@adobe/ecs';
import { spritesModel } from '../../sprites/model/index.js';
import { spritesView } from '../../sprites/view/index.js';

// The world's worker, which the page starts: the world draws every frame, and the page and the loader join it through
// the ports the page sends.

const world = World.create({ [always]: true });
Plugin.start(world, [spritesModel, spritesView]);
self.onmessage = (event: MessageEvent<unknown>) => {
    const ports: unknown = typeof event.data === "object" && event.data !== null ? Reflect.get(event.data, "ports") : null;
    // A thread that couldn't join says why here.
    if (Array.isArray(ports)) for (const port of ports) if (port instanceof MessagePort) world.share(port).catch((error: unknown) => console.error("A thread couldn't join the world:", error));
};
