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

import { describe, it, expect } from "vitest";
import { createPlugin } from "./create-plugin.js";
import { Database } from "./database.js";

describe("Database.Plugin.create", () => {
    describe("single descriptor (no dependencies)", () => {
        it("should create plugin with components, resources, and archetypes", () => {
            const plugin = createPlugin({
                components: {
                    velocity: { type: "number" },
                    particle: { type: "boolean" },
                },
                resources: {
                    mousePosition: { default: 0 as number },
                    fooPosition: { default: 0 as number },
                },
                archetypes: {
                    Particle: ["particle"],
                    DynamicParticle: ["particle", "velocity"],
                },
                systems: {
                    updateSystem: {
                        create: (db) => () => {
                            db.store.archetypes.Particle.insert({ particle: true });
                            db.archetypes.Particle.id.toString();
                            // @ts-expect-error - foo does not exist
                            db.archetypes.foo
                        }
                    }
                }
            });
        });


        it("should infer db type correctly with single descriptor", () => {
            const plugin = createPlugin({
                resources: {
                    time: { default: 0 as number },
                },
                systems: {
                    physicsSystem: {
                        create: (db) => () => {
                            const time: number = db.resources.time;
                            // @ts-expect-error - this should be an error
                            const dt: number = db.resources.deltaTime2;
                        }
                    }
                }
            });

            expect(plugin).toBeDefined();
            expect(plugin.systems).toBeDefined();
        });

        it("should constrain archetype references at input", () => {
            createPlugin({
                components: {
                    particle: { type: "boolean" },
                },
                archetypes: {
                    Particle: ["particle"],
                    // @ts-expect-error - DoesNotExist component does not exist
                    DoesNotExist: ["particle234"],
                },
            });
        });

        it("should constrain archetype access in systems", () => {
            createPlugin({
                components: {
                    particle: { type: "boolean" },
                },
                archetypes: {
                    Particle: ["particle"],
                },
                systems: {
                    testSystem: {
                        create: (db) => () => {
                            db.archetypes.Particle; // ✅ OK
                            // @ts-expect-error - foo does not exist
                            db.archetypes.foo;
                        }
                    }
                }
            });
        });

        it("should constrain schedule references to dependency system names", () => {
            const basePlugin = createPlugin({
                systems: {
                    update: {
                        create: (_db) => () => { }
                    },
                    render: {
                        create: (_db) => () => { }
                    }
                }
            });

            const plugin = createPlugin(
                {
                    systems: {
                        renderSystem: {
                            create: (_db) => () => { },
                            schedule: {
                                after: ["update"],
                                // @ts-expect-error - render2 does not exist
                                before: ["render2"]
                            }
                        }
                    },
                    extends: basePlugin
                },
            );

            expect(plugin).toBeDefined();
            expect(plugin.systems).toBeDefined();
        });
    });

    describe("with dependencies", () => {
        it("should merge components from dependencies", () => {
            const basePlugin = createPlugin({
                components: {
                    position: { type: "number" },
                    health: { type: "number" }
                }
            });

            const extendedPlugin = createPlugin(
                {
                    components: {
                        velocity: { type: "number" }
                    },
                    extends: basePlugin
                },
            );

            expect("position" in extendedPlugin.components).toBe(true);
            expect("health" in extendedPlugin.components).toBe(true);
            expect("velocity" in extendedPlugin.components).toBe(true);
        });

        it("should merge resources from dependencies", () => {
            const basePlugin = createPlugin({
                resources: {
                    time: { default: 0 },
                    config: { default: "default" }
                }
            });

            const extendedPlugin = createPlugin(
                {
                    resources: {
                        delta: { default: 0 }
                    },
                    extends: basePlugin
                },
            );

            expect("time" in extendedPlugin.resources).toBe(true);
            expect("config" in extendedPlugin.resources).toBe(true);
            expect("delta" in extendedPlugin.resources).toBe(true);
        });

        it("should merge systems from dependencies", () => {
            const basePlugin = createPlugin({
                systems: {
                    inputSystem: {
                        create: (_db) => () => { }
                    }
                }
            });

            const extendedPlugin = createPlugin(
                {
                    systems: {
                        renderSystem: {
                            create: (_db) => () => { }
                        }
                    },
                    extends: basePlugin
                },
            );

            expect("inputSystem" in extendedPlugin.systems!).toBe(true);
            expect("renderSystem" in extendedPlugin.systems!).toBe(true);
        });

        it("should allow systems to access dependency resources", () => {
            const basePlugin = createPlugin({
                resources: {
                    time: { default: 0 as number }
                }
            });

            const extendedPlugin = createPlugin(
                {
                    systems: {
                        mySystem: {
                            create: (db) => () => {
                                const time: number = db.resources.time;  // Should work!
                                expect(typeof time).toBe("number");
                            }
                        }
                    },
                    extends: basePlugin
                },
            );

            expect(extendedPlugin).toBeDefined();
        });

        it("should allow multiple dependencies", () => {
            const plugin1 = createPlugin({
                components: { a: { type: "number" } }
            });

            const plugin2 = createPlugin({
                components: { b: { type: "string" } }
            });

            const plugin3 = createPlugin({
                components: { c: { type: "boolean" } }
            });

            const combinedBase = Database.Plugin.combine(plugin1, plugin2, plugin3);
            const merged = createPlugin(
                {
                    components: { d: { type: "number" } },
                    extends: combinedBase
                },
            );

            expect("a" in merged.components).toBe(true);
            expect("b" in merged.components).toBe(true);
            expect("c" in merged.components).toBe(true);
            expect("d" in merged.components).toBe(true);
        });
    });

    describe("schedule validation", () => {


        it("should allow referencing dependency systems in schedule", () => {
            const basePlugin = createPlugin({
                systems: {
                    inputSystem: {
                        create: (_db) => () => { }
                    }
                }
            });

            expect(() => {
                createPlugin(
                    {
                        systems: {
                            renderSystem: {
                                create: (_db) => () => { },
                                schedule: {
                                    after: ["inputSystem"]  // Reference from dependency!
                                }
                            }
                        },
                        extends: basePlugin
                    },
                );
            }).not.toThrow();
        });

        it("should validate across multiple dependencies", () => {
            const plugin1 = createPlugin({
                systems: {
                    system1: {
                        create: (_db) => () => { }
                    }
                }
            });

            const plugin2 = createPlugin({
                systems: {
                    system2: {
                        create: (_db) => () => { }
                    }
                }
            });

            expect(() => {
                createPlugin(
                    {
                        systems: {
                            system3: {
                                create: (_db) => () => { },
                                schedule: {
                                    after: ["system1", "system2"]  // Both from dependencies
                                }
                            }
                        },
                        extends: Database.Plugin.combine(plugin1, plugin2)
                    },
                );
            }).not.toThrow();
        });

        it("should constrain schedule references to dependency system names", () => {
            const basePlugin = createPlugin({
                systems: {
                    inputSystem: {
                        create: (_db) => () => { }
                    },
                    physicsSystem: {
                        create: (_db) => () => { }
                    }
                }
            });

            // ✅ VALID: referencing actual systems from dependencies (no 'as const' needed!)
            const validPlugin = createPlugin(
                {
                    systems: {
                        renderSystem: {
                            create: (_db) => () => { },
                            schedule: {
                                // TypeScript autocompletes: "inputSystem" | "physicsSystem"
                                after: ["inputSystem", "physicsSystem"]
                            }
                        }
                    },
                    extends: basePlugin
                },
            );

            expect(validPlugin).toBeDefined();
            expect(validPlugin.systems).toHaveProperty("renderSystem");
        });
    });

    describe("type inference edge cases", () => {
        it("should block arbitrary property access on resources", () => {
            const plugin = createPlugin({
                resources: {
                    time: { default: 0 as number }
                },
                systems: {
                    testSystem: {
                        create: (db) => () => {
                            const time: number = db.resources.time;  // OK
                            // @ts-expect-error - should error
                            const invalid: number = db.resources.nonExistent;
                        }
                    }
                }
            });

            expect(plugin).toBeDefined();
        });

        it("should block arbitrary property access with dependencies", () => {
            const basePlugin = createPlugin({
                resources: {
                    time: { default: 0 as number }
                }
            });

            const extendedPlugin = createPlugin(
                {
                    resources: {
                        delta: { default: 0 as number }
                    },
                    systems: {
                        testSystem: {
                            create: (db) => () => {
                                const time: number = db.resources.time;    // OK - from dependency
                                const delta: number = db.resources.delta;   // OK - from descriptor
                                // @ts-expect-error - should error
                                const invalid: number = db.resources.nonExistent;
                            }
                        }
                    },
                    extends: basePlugin
                }
            );

            expect(extendedPlugin).toBeDefined();
        });
    });

    describe("identity validation", () => {
        it("should throw error when merging different component definitions", () => {
            const plugin1 = createPlugin({
                components: {
                    health: { type: "number" as const }
                }
            });

            expect(() => {
                createPlugin({
                    components: {
                        health: { type: "string" as const } // Different definition
                    },
                    extends: plugin1
                });
            }).toThrow('Plugin combine conflict: components.health must be identical (===) across plugins');
        });

        it("should throw error when merging different resource definitions", () => {
            const plugin1 = createPlugin({
                resources: {
                    score: { default: 0 }
                }
            });

            expect(() => {
                createPlugin({
                    resources: {
                        score: { default: 100 } // Different definition
                    },
                    extends: plugin1
                });
            }).toThrow('Plugin combine conflict: resources.score must be identical (===) across plugins');
        });

        it("should throw error when merging different archetype definitions", () => {
            const plugin1 = createPlugin({
                components: {
                    position: { type: "number" },
                    velocity: { type: "number" }
                },
                archetypes: {
                    Entity: ["position"]
                }
            });

            expect(() => {
                createPlugin({
                    archetypes: {
                        Entity: ["position", "velocity"] // Different definition
                    },
                    extends: plugin1
                });
            }).toThrow('Plugin combine conflict: archetypes.Entity must be identical (===) across plugins');
        });

        it("should allow same component with identical reference", () => {
            const sharedComponent = { type: "number" as const };
            const plugin1 = createPlugin({
                components: {
                    health: sharedComponent
                }
            });

            expect(() => {
                createPlugin({
                    components: {
                        health: sharedComponent // Same reference - OK
                    },
                    extends: plugin1
                });
            }).not.toThrow();
        });

        it("should throw error when merging different transaction definitions", () => {
            const plugin1 = createPlugin({
                transactions: {
                    updateEntity: (store: any) => {}
                }
            });

            expect(() => {
                createPlugin({
                    transactions: {
                        updateEntity: (store: any) => {} // Different function reference - error
                    },
                    extends: plugin1
                });
            }).toThrow('Plugin combine conflict: transactions.updateEntity must be identical (===) across plugins');
        });

        it("should allow same transaction with identical reference", () => {
            const sharedTransaction = (store: any) => {};
            const plugin1 = createPlugin({
                transactions: {
                    updateEntity: sharedTransaction
                }
            });

            expect(() => {
                createPlugin({
                    transactions: {
                        updateEntity: sharedTransaction // Same reference - OK
                    },
                    extends: plugin1
                });
            }).not.toThrow();
        });

        it("should throw error when merging different system definitions", () => {
            const plugin1 = createPlugin({
                systems: {
                    update: {
                        create: () => () => { }
                    }
                }
            });

            expect(() => {
                createPlugin({
                    systems: {
                        update: {
                            create: () => () => { } // Different function - error
                        }
                    },
                    extends: plugin1
                });
            }).toThrow('Plugin combine conflict: systems.update must be identical (===) across plugins');
        });

        it("should allow same system with identical reference", () => {
            const sharedSystem = {
                create: () => () => { }
            };
            const plugin1 = createPlugin({
                systems: {
                    update: sharedSystem
                }
            });

            expect(() => {
                createPlugin({
                    systems: {
                        update: sharedSystem // Same reference - OK
                    },
                    extends: plugin1
                });
            }).not.toThrow();
        });
    });
});

