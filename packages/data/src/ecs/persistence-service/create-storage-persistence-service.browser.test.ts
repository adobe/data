// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createStoragePersistenceService } from "./create-storage-persistence-service.js";
import { Database } from "../index.js";

function createMinimalDatabase() {
    return Database.create(
        Database.Plugin.create({
            components: {
                n: { type: "number" },
            },
            archetypes: { N: ["n"] },
            transactions: {
                tick(t, _args: Record<string, never>) {
                    t.archetypes.N.insert({ n: 0 });
                },
            },
        })
    );
}

describe("createStoragePersistenceService", () => {
    describe("autoSaveOnChange with rapid transactions", () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it("given rapid non-transient transactions, invokes save once after debounce window (debounced)", async () => {
            let saveInvokeCount = 0;
            const database = createMinimalDatabase();
            const service = await createStoragePersistenceService({
                database,
                defaultFileId: "test-id",
                autoSaveOnChange: true,
                autoLoadOnStart: false,
            });
            const originalSave = service.save;
            Object.assign(service, {
                save: async (fileId?: string) => {
                    saveInvokeCount++;
                    return originalSave.call(service, fileId);
                },
            });

            const transactionCount = 5;
            for (let i = 0; i < transactionCount; i++) {
                database.transactions.tick({});
            }

            vi.advanceTimersByTime(350);
            await vi.runAllTimersAsync();

            expect(saveInvokeCount).toBe(1);
        });
    });
});
