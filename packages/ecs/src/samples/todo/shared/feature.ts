import type { System } from "../../../index.js";
import type { create } from "../../../implementation/index.js";
import type { Connect } from "./connect.js";
import type { Elements } from "./elements/define.js";

/** Values resources start at, as a world takes them. */
export type Resources = Exclude<Parameters<typeof create>[0], undefined>;

/**
 * What the app needs of a feature to compose it with the others. Its components, resources, indexes, rules and
 * finalizers register as its modules load, so they aren't listed.
 */
export type Feature = {
    /** The elements it creates or finds on the page, by their tag names, which the app defines. */
    readonly elements: Elements;
    /** The fixed elements it drives, found within the page's root, as the resources it reads them from. */
    readonly resources: (root: ParentNode) => Resources;
    /** Its DOM systems, as one composite added to every tick; null for none. */
    readonly system: System | null;
    readonly connect: Connect;
};
