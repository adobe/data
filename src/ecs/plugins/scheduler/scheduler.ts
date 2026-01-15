/*MIT License

© Copyright 2025 Adobe. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.*/

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

