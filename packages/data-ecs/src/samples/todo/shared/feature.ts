import type { System } from "../../../index.js";
import type { createWorld } from "../../../implementation/index.js";
import type { Connect } from "./connect.js";

/** Values resources start at, as a world takes them. */
export type Resources = Exclude<Parameters<typeof createWorld>[0], undefined>;

/**
 * What the app needs of a feature to compose it with the others. Its components, resources, indexes, rules and
 * finalizers register as its modules load, so they aren't listed.
 */
export type Feature = {
    /** Defines the elements it creates or finds on the page. */
    readonly define: () => void;
    /** The fixed elements it drives, found within the page's root, as the resources it reads them from. */
    readonly resources: (root: ParentNode) => Resources;
    /** Its DOM systems, added to every tick. */
    readonly systems: readonly System[];
    readonly connect: Connect;
};
