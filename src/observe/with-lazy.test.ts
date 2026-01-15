// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from 'vitest';
import { withLazy } from './with-lazy.js';
import { createState } from './create-state.js';

describe('withLazy', () => {
    it('should defer observable creation until first subscription', () => {
        let factoryCalled = false;
        const factory = () => {
            factoryCalled = true;
            const [source] = createState<number>(42);
            return source;
        };

        const lazyObs = withLazy(factory);
        expect(factoryCalled).toBe(false);

        const values: number[] = [];
        const unsubscribe = lazyObs(value => values.push(value));
        
        expect(factoryCalled).toBe(true);
        expect(values).toEqual([42]);
        
        unsubscribe();
    });

    it('should cache the observable after first creation', () => {
        let callCount = 0;
        const factory = () => {
            callCount++;
            const [source] = createState<number>(42);
            return source;
        };

        const lazyObs = withLazy(factory);
        
        // First subscription
        const unsubscribe1 = lazyObs(() => {});
        expect(callCount).toBe(1);
        
        // Second subscription should reuse the same observable
        const unsubscribe2 = lazyObs(() => {});
        expect(callCount).toBe(1);
        
        unsubscribe1();
        unsubscribe2();
    });
}); 