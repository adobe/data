// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect, vi } from 'vitest';
import { withBatch } from './with-batch.js';
import { createState } from './create-state.js';

describe('withBatch', () => {
    it('should batch multiple rapid emissions into a single notification', async () => {
        const [source, setSource] = createState<number>(1);
        const batched = withBatch(source);
        
        const observedValues: number[] = [];
        const unsubscribe = batched((value) => {
            observedValues.push(value);
        });

        // Initial value should be emitted immediately
        expect(observedValues).toEqual([1]);

        // Multiple rapid updates should be batched
        setSource(2);
        setSource(3);
        setSource(4);

        // Should not have emitted yet (still in same microtask)
        expect(observedValues).toEqual([1]);

        // Wait for next microtask
        await new Promise(resolve => setTimeout(resolve, 0));

        // Should have emitted only the last value
        expect(observedValues).toEqual([1, 4]);

        unsubscribe();
    });

    it('should handle multiple batches correctly', async () => {
        const [source, setSource] = createState<number>(1);
        const batched = withBatch(source);
        
        const observedValues: number[] = [];
        const unsubscribe = batched((value) => {
            observedValues.push(value);
        });

        // Initial value
        expect(observedValues).toEqual([1]);

        // First batch
        setSource(2);
        setSource(3);

        // Second batch (after microtask)
        await new Promise(resolve => setTimeout(resolve, 0));
        setSource(4);
        setSource(5);

        // Should have emitted only the last value from first batch
        expect(observedValues).toEqual([1, 3]);

        // Wait for second batch
        await new Promise(resolve => setTimeout(resolve, 0));

        // Should have emitted only the last value from second batch
        expect(observedValues).toEqual([1, 3, 5]);

        unsubscribe();
    });

    it('should handle unsubscribe correctly', async () => {
        const [source, setSource] = createState<number>(1);
        const batched = withBatch(source);
        
        const observedValues: number[] = [];
        const unsubscribe = batched((value) => {
            observedValues.push(value);
        });

        // Initial value
        expect(observedValues).toEqual([1]);

        // Update and unsubscribe before microtask
        setSource(2);
        unsubscribe();

        // Wait for microtask
        await new Promise(resolve => setTimeout(resolve, 0));

        // Should not have emitted after unsubscribe
        expect(observedValues).toEqual([1]);
    });

    it('should work with multiple observers', async () => {
        const [source, setSource] = createState<number>(1);
        const batched = withBatch(source);
        
        const values1: number[] = [];
        const values2: number[] = [];

        const unsubscribe1 = batched((value) => values1.push(value));
        const unsubscribe2 = batched((value) => values2.push(value));

        // Both observers should get initial value
        expect(values1).toEqual([1]);
        expect(values2).toEqual([1]);

        // Multiple rapid updates
        setSource(2);
        setSource(3);
        setSource(4);

        // Wait for microtask
        await new Promise(resolve => setTimeout(resolve, 0));

        // Both observers should get only the last value
        expect(values1).toEqual([1, 4]);
        expect(values2).toEqual([1, 4]);

        unsubscribe1();
        unsubscribe2();
    });
}); 