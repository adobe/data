// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect, vi } from 'vitest';
import { observeDependentValue } from './observe-dependent-value.js';
import { Store } from '../store/index.js';
import { Database } from './database.js';
import { ToReadonlyStore } from '../store/index.js';

describe('observeDependentValue', () => {
    it('should compute and observe dependent values from resources', async () => {
        // Create a store with three resources
        const store = Store.create(
            { components: {}, resources: { a: { default: 10 }, b: { default: 20 }, c: { default: 30 } }, archetypes: {} },
        );
        type TestStore = ToReadonlyStore<typeof store>;

        // Create the database
        const database = Database.create(store, {
            updateA: (t, value: number) => {
                t.resources.a = value;
            },
            updateB: (t, value: number) => {
                t.resources.b = value;
            },
            updateC: (t, value: number) => {
                t.resources.c = value;
            },
            updateAB: (t, values: { a: number; b: number }) => {
                t.resources.a = values.a;
                t.resources.b = values.b;
            }
        });

        type TestDatabase = typeof database;

        // Create a compute function that sums resources 'a' and 'b'
        const computeSum = (db: TestStore) => {
            return db.resources.a + db.resources.b;
        };

        // Create the dependent value observable
        const sumObservable = observeDependentValue(database, computeSum);

        // Track observed values
        const observedValues: number[] = [];
        const unsubscribe = sumObservable((value) => {
            observedValues.push(value);
        });

        // Should immediately provide the initial computed value
        expect(observedValues).toEqual([30]); // 10 + 20

        // Update resource 'a'
        database.transactions.updateA(15);
        await Promise.resolve();

        // Should recompute and notify with new value
        expect(observedValues).toEqual([30, 35]); // 15 + 20

        // Update resource 'b'
        database.transactions.updateB(25);
        await Promise.resolve();

        // Should recompute and notify with new value
        expect(observedValues).toEqual([30, 35, 40]); // 15 + 25

        // Update resource 'c' (not used in computation)
        database.transactions.updateC(50);
        await Promise.resolve();

        // Should NOT recompute since 'c' is not used in the computation
        expect(observedValues).toEqual([30, 35, 40]);

        // Update both 'a' and 'b' in same transaction
        database.transactions.updateAB({ a: 5, b: 10 });
        await Promise.resolve();

        // Should recompute once with final values
        expect(observedValues).toEqual([30, 35, 40, 15]); // 5 + 10

        // Test unsubscribe
        unsubscribe();

        // Update after unsubscribe
        database.transactions.updateA(100);
        await Promise.resolve();

        // Should not notify after unsubscribe
        expect(observedValues).toEqual([30, 35, 40, 15]);
    });

    it('should handle multiple observers correctly', async () => {
        const store = Store.create({ components: {}, resources: { a: { default: 1 }, b: { default: 2 }, c: { default: 3 } }, archetypes: {} });
        const database = Database.create(store, {
            updateA: (t, value: number) => { t.resources.a = value; },
            updateB: (t, value: number) => { t.resources.b = value; }
        });

        const sumObservable = observeDependentValue(database, (t) => {
            return t.resources.a + t.resources.b;
        });

        const values1: number[] = [];
        const values2: number[] = [];

        const unsubscribe1 = sumObservable((value) => values1.push(value));
        const unsubscribe2 = sumObservable((value) => values2.push(value));

        // Both observers should get initial value
        expect(values1).toEqual([3]);
        expect(values2).toEqual([3]);

        // Update a resource
        database.transactions.updateA(5);
        await Promise.resolve();

        // Both observers should get updated value
        expect(values1).toEqual([3, 7]);
        expect(values2).toEqual([3, 7]);

        // Unsubscribe one observer
        unsubscribe1();

        // Update again
        database.transactions.updateB(8);
        await Promise.resolve();

        // Only remaining observer should get update
        expect(values1).toEqual([3, 7]); // No more updates
        expect(values2).toEqual([3, 7, 13]); // Gets new update

        unsubscribe2();
    });

    it('should handle complex computed values', async () => {
        const store = Store.create({ components: {}, resources: { count: { default: 5 }, multiplier: { default: 2 }, offset: { default: 10 } }, archetypes: {} });
        const database = Database.create(store, {
            updateCount: (t, value: number) => { t.resources.count = value; },
            updateMultiplier: (t, value: number) => { t.resources.multiplier = value; }
        });

        type TestDatabase = typeof database;

        const complexObservable = observeDependentValue(database, (store) => {
            return (store.resources.count * store.resources.multiplier) + store.resources.offset;
        });

        const values: number[] = [];
        const unsubscribe = complexObservable((value) => values.push(value));

        // Initial: (5 * 2) + 10 = 20
        expect(values).toEqual([20]);

        // Update count
        database.transactions.updateCount(3);
        await Promise.resolve();

        // New: (3 * 2) + 10 = 16
        expect(values).toEqual([20, 16]);

        // Update multiplier
        database.transactions.updateMultiplier(4);
        await Promise.resolve();

        // New: (3 * 4) + 10 = 22
        expect(values).toEqual([20, 16, 22]);

        unsubscribe();
    });
}); 