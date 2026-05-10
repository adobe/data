// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Provider-contract conformance tests.
//
// The `runProviderContractTests` helper exercises the full
// mount → write → flush → checkpoint → dispose → reload lifecycle against
// any PersistenceProvider. This file drives it against the MemoryProvider
// (node-only, no I/O). The node-fs and OPFS providers are exercised by
// their own environment-specific test files.

import { Database } from "@adobe/data/ecs";
import { F32 } from "@adobe/data/math";
import { describe, expect, it } from "vitest";
import { mount } from "./mount.js";
import type { PersistenceProvider } from "./persistence-provider.js";
import { createMemoryProvider } from "./create-memory-provider.js";

// ─── Shared schema ────────────────────────────────────────────────────────────

const entityPlugin = Database.Plugin.create({
    components: {
        x: F32.schema,
        y: F32.schema,
        label: { type: "string" },
    } as const,
    archetypes: {
        Point: ["x", "y", "label"],
    } as const,
    transactions: {
        createPoint(t, args: { x: number; y: number; label: string }) {
            return t.archetypes.Point.insert(args);
        },
        movePoint(t, args: { entity: number; x: number; y: number }) {
            t.update(args.entity, { x: args.x, y: args.y });
        },
    },
});

const noCheckpoint = { everyNTransactions: 0, idleMs: 0 } as const;

// ─── Contract test suite (provider-agnostic) ──────────────────────────────────

/**
 * Run the full provider lifecycle contract against any provider.
 * Call this from environment-specific test files to validate new providers.
 *
 * NOTE: the provider must support creating a fresh, empty persistence root
 * on each call to `mount` (or accept a factory so each test gets isolation).
 */
export const runProviderContractTests = (
    providerName: string,
    makeProvider: () => PersistenceProvider,
): void => {
    describe(`${providerName} — provider contract`, () => {
        it("mount returns a service with the expected methods", async () => {
            const provider = makeProvider();
            const db = Database.create(entityPlugin);
            const m = await mount(provider, db, { checkpoint: noCheckpoint });
            expect(typeof m.service.save).toBe("function");
            expect(typeof m.service.load).toBe("function");
            expect(typeof m.service.flush).toBe("function");
            expect(typeof m.service.checkpoint).toBe("function");
            expect(typeof m.service.dispose).toBe("function");
            expect(typeof m.dispose).toBe("function");
            await m.dispose();
        });

        it("persists an entity across dispose → re-mount → load", async () => {
            const provider = makeProvider();
            const db1 = Database.create(entityPlugin);
            const m1 = await mount(provider, db1, { checkpoint: noCheckpoint });

            const entity = db1.transactions.createPoint({ x: 1, y: 2, label: "A" });
            await m1.service.flush();
            await m1.service.checkpoint();
            await m1.dispose();

            const db2 = Database.create(entityPlugin);
            const m2 = await mount(provider, db2, { checkpoint: noCheckpoint });
            await m2.service.load();
            await m2.dispose();

            const view = db2.read(entity!);
            expect(view).not.toBeNull();
            expect(view!.label).toBe("A");
            expect(view!.x).toBeCloseTo(1);
            expect(view!.y).toBeCloseTo(2);
        });

        it("persists multiple entities with correct values", async () => {
            const provider = makeProvider();
            const db1 = Database.create(entityPlugin);
            const m1 = await mount(provider, db1, { checkpoint: noCheckpoint });

            const e1 = db1.transactions.createPoint({ x: 10, y: 20, label: "P1" });
            const e2 = db1.transactions.createPoint({ x: 30, y: 40, label: "P2" });
            await m1.service.flush();
            await m1.service.checkpoint();
            await m1.dispose();

            const db2 = Database.create(entityPlugin);
            const m2 = await mount(provider, db2, { checkpoint: noCheckpoint });
            await m2.service.load();
            await m2.dispose();

            expect(db2.read(e1!)?.label).toBe("P1");
            expect(db2.read(e2!)?.label).toBe("P2");
            expect(db2.read(e1!)?.x).toBeCloseTo(10);
            expect(db2.read(e2!)?.y).toBeCloseTo(40);
        });

        it("reflects updates made after the initial checkpoint via journal replay", async () => {
            const provider = makeProvider();
            const db1 = Database.create(entityPlugin);
            const m1 = await mount(provider, db1, { checkpoint: noCheckpoint });

            const entity = db1.transactions.createPoint({ x: 0, y: 0, label: "Origin" });
            await m1.service.flush();
            await m1.service.checkpoint();

            // Write after checkpoint — lives only in the journal.
            db1.transactions.movePoint({ entity: entity!, x: 99, y: 88 });
            await m1.service.flush();
            // Intentionally no second checkpoint.
            await m1.dispose();

            const db2 = Database.create(entityPlugin);
            const m2 = await mount(provider, db2, { checkpoint: noCheckpoint });
            await m2.service.load();
            await m2.dispose();

            const view = db2.read(entity!);
            expect(view).not.toBeNull();
            expect(view!.x).toBeCloseTo(99);
            expect(view!.y).toBeCloseTo(88);
        });

        it("dispose can be called multiple times without error", async () => {
            const provider = makeProvider();
            const db = Database.create(entityPlugin);
            const m = await mount(provider, db, { checkpoint: noCheckpoint });
            await m.dispose();
            // Second dispose should be a safe no-op.
            await m.dispose();
        });

        it("mount.service.serviceName is a non-empty string", async () => {
            const provider = makeProvider();
            const db = Database.create(entityPlugin);
            const m = await mount(provider, db, { checkpoint: noCheckpoint });
            expect(typeof m.service.serviceName).toBe("string");
            expect(m.service.serviceName.length).toBeGreaterThan(0);
            await m.dispose();
        });

        it("provider.providerName is a non-empty string", () => {
            const provider = makeProvider();
            expect(typeof provider.providerName).toBe("string");
            expect(provider.providerName.length).toBeGreaterThan(0);
        });
    });
};

// ─── Run against MemoryProvider ───────────────────────────────────────────────

runProviderContractTests("MemoryProvider", createMemoryProvider);
