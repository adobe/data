// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, test } from 'vitest';
import { Observe } from './index.js';
import { toPromise } from './to-promise.js';

describe('toPromise', () => {
    test('leaks subscription on synchronous emission', async () => {
        let activeSubscribers = 0;

        const source: Observe<string> = observer => {
            activeSubscribers++;
            observer('value');
            return () => { activeSubscribers--; };
        };

        await toPromise(source);

        expect(activeSubscribers).toBe(0);
    });

    test('second toPromise sees stale cached value after mutation', async () => {
        let state = 'A';
        const subscribers = new Set<(v: string) => void>();

        const source: Observe<string> = observer => {
            subscribers.add(observer);
            observer(state);
            return () => { subscribers.delete(observer); };
        };

        const cached = Observe.withCache(source);

        const v1 = await toPromise(cached);
        expect(v1).toBe('A');

        state = 'B';
        queueMicrotask(() => { for (const s of subscribers) s('B'); });

        const v2 = await toPromise(cached);
        expect(v2).toBe('B');
    });
});
