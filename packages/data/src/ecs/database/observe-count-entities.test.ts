// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it, beforeEach, vi } from "vitest";
import { Database } from "./database.js";
import { F32 } from "../../math/f32/index.js";
import { Boolean } from "../../schema/index.js";

describe("observeCountEntities", () => {
    function createTestDatabase() {
        return Database.create(Database.Plugin.create({
            components: { position: F32.schema, health: F32.schema, active: Boolean.schema },
            resources: {},
            archetypes: {
                Position: ["position"],
                PositionHealth: ["position", "health"],
                Active: ["active"],
            },
            transactions: {
                addPosition(store, args: { position: number }) { return store.archetypes.Position.insert(args); },
                addPositionHealth(store, args: { position: number, health: number }) { return store.archetypes.PositionHealth.insert(args); },
                addActive(store, args: { active: boolean }) { return store.archetypes.Active.insert(args); },
                update(store, args: { entity: number, values: any }) { return store.update(args.entity, args.values); },
                remove(store, args: { entity: number }) { return store.delete(args.entity); },
            },
        }));
    }

    let db: ReturnType<typeof createTestDatabase>;
    beforeEach(() => { db = createTestDatabase(); });

    it("emits the initial count summed across matching archetypes", () => {
        db.transactions.addPosition({ position: 1 });
        db.transactions.addPositionHealth({ position: 2, health: 9 });
        const observer = vi.fn();
        const unobserve = db.observe.count(["position"])(observer);
        expect(observer).toHaveBeenCalledTimes(1);
        expect(observer).toHaveBeenLastCalledWith(2); // Position(1) + PositionHealth(1)
        unobserve();
    });

    it("re-emits on entity add and delete", async () => {
        const observer = vi.fn();
        const unobserve = db.observe.count(["position"])(observer);
        expect(observer).toHaveBeenLastCalledWith(0);

        const e = db.transactions.addPosition({ position: 1 });
        await Promise.resolve();
        expect(observer).toHaveBeenLastCalledWith(1);

        db.transactions.addPositionHealth({ position: 2, health: 5 });
        await Promise.resolve();
        expect(observer).toHaveBeenLastCalledWith(2);

        db.transactions.remove({ entity: e });
        await Promise.resolve();
        expect(observer).toHaveBeenLastCalledWith(1);
        unobserve();
    });

    it("does NOT re-emit when only a value changes (count unchanged)", async () => {
        const e = db.transactions.addPosition({ position: 1 });
        const observer = vi.fn();
        const unobserve = db.observe.count(["position"])(observer);
        expect(observer).toHaveBeenCalledTimes(1); // initial 1

        db.transactions.update({ entity: e, values: { position: 999 } });
        await Promise.resolve();
        expect(observer).toHaveBeenCalledTimes(1); // membership unchanged → deduped
        unobserve();
    });

    it("does NOT re-emit when an irrelevant component changes", async () => {
        db.transactions.addPosition({ position: 1 });
        const other = db.transactions.addActive({ active: true });
        const observer = vi.fn();
        const unobserve = db.observe.count(["position"])(observer);
        expect(observer).toHaveBeenCalledTimes(1);

        db.transactions.update({ entity: other, values: { active: false } });
        await Promise.resolve();
        expect(observer).toHaveBeenCalledTimes(1);
        unobserve();
    });

    it("tracks a where-filtered count as rows cross the boundary", async () => {
        const e = db.transactions.addActive({ active: false });
        const observer = vi.fn();
        const unobserve = db.observe.count(["active"], { where: { active: true } })(observer);
        expect(observer).toHaveBeenLastCalledWith(0);

        db.transactions.update({ entity: e, values: { active: true } });
        await Promise.resolve();
        expect(observer).toHaveBeenLastCalledWith(1);

        db.transactions.update({ entity: e, values: { active: false } });
        await Promise.resolve();
        expect(observer).toHaveBeenLastCalledWith(0);
        unobserve();
    });
});
