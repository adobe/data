// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { System, World } from "@adobe/ecs";
import type { Connect } from "./connect.js";
import type { Elements } from "./elements/define.js";

/** Values resources start at, as a world takes them. */
export type Resources = Exclude<Parameters<typeof World.create>[0], undefined>;

/**
 * What the app needs of a feature to compose it with the others. Its components, resources, indexes and finalizers
 * register as its modules load, so they aren't listed.
 */
export type Feature = {
    /** The elements it creates or finds on the page, by their tag names, which the app defines. */
    readonly elements: Elements;
    /** The fixed elements and services it drives, found or made for the page's root, as the resources it reads them from. */
    readonly resources: (root: HTMLElement) => Resources;
    /** Its DOM systems, as one composite added to every tick; null for none. */
    readonly system: System | null;
    readonly connect: Connect;
    /** What it puts in the world before its events are connected, after the features before it. */
    readonly start: (world: World) => Promise<void>;
};
