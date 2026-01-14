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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Database } from "../database.js";
import { scheduler } from "../../plugins/scheduler/scheduler.js";

describe("createDatabase with scheduler plugin extension", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should have all systems in functions when scheduler executes", async () => {
        // This test reproduces the bug: when a plugin extends scheduler,
        // the scheduler's executeFrame is called immediately during system creation,
        // but db.system.functions is still empty at that point because it's only
        // populated after all systems are created. This causes the error:
        // "db.system.functions[name] is not a function"
        
        const basePlugin = scheduler;
        
        const extendedPlugin = Database.Plugin.create({
            extends: basePlugin,
            systems: {
                testSystem: {
                    create: (db) => () => {
                        // Test system
                    }
                }
            },
        });

        // The bug: Database.create should not throw even though scheduler
        // executeFrame is called during system initialization
        const db = Database.create(extendedPlugin);
        
        // Verify all systems are in functions (this should pass after fix)
        const allSystemNames = new Set<string>();
        for (const tier of db.system.order) {
            for (const name of tier) {
                allSystemNames.add(name);
            }
        }
        
        // Check that all systems in order exist in functions
        for (const name of allSystemNames) {
            expect(db.system.functions[name as keyof typeof db.system.functions]).toBeDefined();
            expect(typeof db.system.functions[name as keyof typeof db.system.functions]).toBe("function");
        }
        
        // Also verify the reverse: all functions are in the order
        const functionNames = new Set(Object.keys(db.system.functions));
        const orderNames = new Set<string>();
        for (const tier of db.system.order) {
            for (const name of tier) {
                orderNames.add(name);
            }
        }
        
        // All functions should be in order
        for (const name of functionNames) {
            expect(orderNames.has(name)).toBe(true);
        }
        
        // Stop the scheduler
        db.store.resources.schedulerState = "disposed";
        
        // Advance timers to let any pending RAF callbacks execute
        await vi.runAllTimersAsync();
    });
});

