// © 2026 Adobe. MIT License. See /LICENSE for details.

import { createPlugin } from "../../database/create-plugin.js";

export type SchedulerState = "running" | "paused" | "disposed";

export const scheduler = createPlugin({
    resources: {
        schedulerState: { default: "running" as SchedulerState }
    },
    systems: {
        schedulerSystem: {
            create: (db) => {
                // Execute one frame
                const executeFrame = async () => {
                    if (db.resources.schedulerState === "running") {
                        // Execute all systems in order (excluding schedulerSystem itself)
                        for (const tier of db.system.order) {
                            // Execute tier in parallel, filtering out schedulerSystem and systems that returned void
                            await Promise.all(
                                tier
                                    .filter((name: string) => name !== "schedulerSystem")
                                    .map((name: string) => {
                                        const systemFn = db.system.functions[name];
                                        if (systemFn === undefined) {
                                            // System returned void - skip execution (initialization-only system)
                                            return Promise.resolve();
                                        }
                                        if (typeof systemFn !== "function") {
                                            throw new Error(
                                                `System "${name}" is not a function. ` +
                                                `Available systems: ${Object.keys(db.system.functions).join(", ")}`
                                            );
                                        }
                                        return systemFn();
                                    })
                            );
                        }
                    }

                    if (db.resources.schedulerState !== "disposed") {
                        requestAnimationFrame(executeFrame);
                    }
                };

                // Defer execution until after all systems are created and db.system.functions is populated
                requestAnimationFrame(executeFrame);

                // Return a no-op system function (the real work happens in the RAF loop)
                return () => {
                    // No-op: The scheduler manages its own execution through RAF
                };
            }
        }
    }
});

