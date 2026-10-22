import { System } from "../../interface/system/system.js";
import type { World } from "../../interface/world/world.js";

const settled = System.create({ name: "observeTest/settled", observer: true }, () => {});

/**
 * Resolves once every observer factory subscribed before it had its first value: after the factories' flush, which the
 * end of this task starts, and a run queued after the runs it makes, which changes nothing.
 */
export const settle = async (world: World): Promise<void> => {
    await Promise.resolve();
    await world.run(settled);
};
