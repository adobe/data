// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from 'vitest';
import { toAsyncGenerator } from './to-async-generator.js';
import { Observe } from './index.js';

// Helper function to create test observables
function createTestObservable<T>(
    sync: T | undefined,
    async: Array<T>
): [Observe<T>, () => Promise<void>] {
    const observers = new Set<(value: T) => void>();
    const observe: Observe<T> = (observer) => {
        observers.add(observer);
        if (sync !== undefined) {
            observer(sync);
        }
        return () => {
            observers.delete(observer);
        };
    };
    return [
        observe,
        async () => {
            for (const value of async) {
                await Promise.resolve();
                for (const observer of observers) {
                    observer(value);
                }
            }
            // Add finish signal after all async values
            for (const observer of observers) {
                observer(null as any);
            }
        },
    ];
}

// Helper function to collect all values from an async generator
async function collectValues<T>(generator: AsyncGenerator<T>): Promise<T[]> {
    const values: T[] = [];
    let done: boolean | undefined;
    while (!done) {
        const result = await generator.next();
        done = result.done;
        if (!done) {
            values.push(result.value);
        }
    }
    return values;
}

describe('toAsyncGenerator', () => {
    it('should convert observable with sync value to async generator', async () => {
        // Create a simple observable that emits a sync value and then finishes
        const observe: Observe<number> = (notify) => {
            notify(42);
            notify(null as any); // Explicitly finish the generator
            return () => { };
        };

        const generator = toAsyncGenerator(observe);

        // Consume the generator
        const result = await generator.next();
        expect(result.done).toBe(false);
        expect(result.value).toBe(42);

        // Should get the finish value before being done
        const finishResult = await generator.next();
        expect(finishResult.done).toBe(false);
        expect(finishResult.value).toBe(null);

        // Should be done after consuming the finish value
        const doneResult = await generator.next();
        expect(doneResult).toEqual({ done: true, value: undefined });
    });

    it('should work with async observable', async () => {
        // Create an async observable
        const observe: Observe<number> = (notify) => {
            // Emit value asynchronously
            setTimeout(() => {
                notify(42);
                notify(null as any); // Finish
            }, 0);
            return () => { };
        };

        const generator = toAsyncGenerator(observe);

        // Consume the generator
        const result = await generator.next();
        expect(result.done).toBe(false);
        expect(result.value).toBe(42);

        // Should get the finish value before being done
        const finishResult = await generator.next();
        expect(finishResult.done).toBe(false);
        expect(finishResult.value).toBe(null);

        // Should be done after consuming the finish value
        const doneResult = await generator.next();
        expect(doneResult).toEqual({ done: true, value: undefined });
    });

    it('should work with custom finished function', async () => {
        // Create an observable that emits a specific finish value
        const observe: Observe<number> = (notify) => {
            notify(42);
            notify(999); // Use 999 as finish signal
            return () => { };
        };

        // Custom finished function that finishes on 999
        const generator = toAsyncGenerator(observe, (value) => value === 999);

        // Consume the generator
        const result = await generator.next();
        expect(result.done).toBe(false);
        expect(result.value).toBe(42);

        // Should get the finish value before being done
        const finishResult = await generator.next();
        expect(finishResult.done).toBe(false);
        expect(finishResult.value).toBe(999);

        // Should be done after consuming the finish value
        const doneResult = await generator.next();
        expect(doneResult).toEqual({ done: true, value: undefined });
    });

    it('should yield synchronous values immediately', async () => {
        const observe: Observe<number> = (notify) => {
            notify(42);
            notify(null as any); // Finish immediately
            return () => { };
        };
        const generator = toAsyncGenerator(observe);

        const values = await collectValues(generator);
        expect(values).toEqual([42, null]);
    });

    it('should yield asynchronous values in order', async () => {
        const observe: Observe<number> = (notify) => {
            // Emit values asynchronously
            setTimeout(() => {
                notify(1);
                notify(2);
                notify(3);
                notify(null as any); // Finish
            }, 0);
            return () => { };
        };
        const generator = toAsyncGenerator(observe);

        const values = await collectValues(generator);
        expect(values).toEqual([1, 2, 3, null]);
    });

    it('should yield both sync and async values in correct order', async () => {
        const observe: Observe<number> = (notify) => {
            notify(0); // Sync value
            // Emit values asynchronously
            setTimeout(() => {
                notify(1);
                notify(2);
                notify(3);
                notify(null as any); // Finish
            }, 0);
            return () => { };
        };
        const generator = toAsyncGenerator(observe);

        const values = await collectValues(generator);
        expect(values).toEqual([0, 1, 2, 3, null]);
    });

    it('should stop on null/undefined by default', async () => {
        const observe: Observe<number> = (notify) => {
            notify(1);
            notify(null as any); // This should finish the generator
            notify(3); // This should be ignored
            return () => { };
        };
        const generator = toAsyncGenerator(observe);

        const values = await collectValues(generator);
        expect(values).toEqual([1, null]);
    });

    it('should handle empty observable', async () => {
        const observe: Observe<number> = (notify) => {
            notify(null as any); // Finish immediately
            return () => { };
        };
        const generator = toAsyncGenerator(observe);

        const values = await collectValues(generator);
        expect(values).toEqual([null]);
    });

    it('should handle immediate finish value', async () => {
        const [observe] = createTestObservable(null, [1, 2, 3]);
        const generator = toAsyncGenerator(observe);

        const values = await collectValues(generator);
        expect(values).toEqual([null]);
    });

    it('should handle multiple rapid emissions', async () => {
        const observe: Observe<number> = (notify) => {
            // Emit values rapidly
            setTimeout(() => {
                notify(1);
                notify(2);
                notify(3);
                notify(4);
                notify(5);
                notify(null as any); // Finish
            }, 0);
            return () => { };
        };
        const generator = toAsyncGenerator(observe);

        const values = await collectValues(generator);
        expect(values).toEqual([1, 2, 3, 4, 5, null]);
    });

    it('should handle synchronous finish in observe callback', async () => {
        const observe: Observe<number> = (notify) => {
            notify(1);
            notify(2);
            notify(null as any); // This should finish the generator
            notify(4); // This should be ignored
            return () => { };
        };

        const generator = toAsyncGenerator(observe);
        const values = await collectValues(generator);
        expect(values).toEqual([1, 2, null]);
    });

    it('should handle errors in finished function', async () => {
        const observe: Observe<number> = (notify) => {
            notify(1);
            notify(2);
            notify(3);
            return () => { };
        };
        const generator = toAsyncGenerator(observe, () => {
            throw new Error('Finished function error');
        });

        await expect(collectValues(generator)).rejects.toThrow('Finished function error');
    });

    it('should handle return() method correctly', async () => {
        const observe: Observe<number> = (notify) => {
            notify(1);
            notify(2);
            notify(3);
            notify(null as any); // Finish
            return () => { };
        };
        const generator = toAsyncGenerator(observe);

        // Get first value
        const firstResult = await generator.next();
        expect(firstResult).toEqual({ done: false, value: 1 });

        // Return early
        const returnResult = await generator.return(undefined);
        expect(returnResult).toEqual({ done: true, value: undefined });

        // Subsequent calls should return done
        const nextResult = await generator.next();
        expect(nextResult).toEqual({ done: true, value: undefined });
    });

    it('should handle throw() method correctly', async () => {
        const [observe] = createTestObservable(undefined, [1, 2, 3]);
        const generator = toAsyncGenerator(observe);

        const error = new Error('Test throw error');
        await expect(generator.throw(error)).rejects.toThrow('Test throw error');
    });

    it('should handle multiple subscribers correctly', async () => {
        const observe: Observe<number> = (notify) => {
            notify(1);
            notify(2);
            notify(3);
            notify(null as any); // Finish
            return () => { };
        };

        // Create two generators
        const generator1 = toAsyncGenerator(observe);
        const generator2 = toAsyncGenerator(observe);

        // Collect from both
        const values1 = await collectValues(generator1);
        const values2 = await collectValues(generator2);

        expect(values1).toEqual([1, 2, 3, null]);
        expect(values2).toEqual([1, 2, 3, null]);
    });

    it('should handle queue compaction correctly', async () => {
        const observe: Observe<number> = (notify) => {
            // Emit many values
            setTimeout(() => {
                for (let i = 0; i < 2000; i++) {
                    notify(i);
                }
                notify(null as any); // Finish
            }, 0);
            return () => { };
        };
        const generator = toAsyncGenerator(observe);

        const values = await collectValues(generator);
        expect(values).toEqual([...Array.from({ length: 2000 }, (_, i) => i), null]);
    });

    it('should handle custom finished function that never returns true', async () => {
        const observe: Observe<number> = (notify) => {
            notify(1);
            notify(2);
            notify(3);
            notify(null as any); // Finish signal (but finished function ignores it)
            return () => { };
        };
        const generator = toAsyncGenerator(observe, () => false);

        // Test that we can get the first few values
        const result1 = await generator.next();
        expect(result1).toEqual({ done: false, value: 1 });

        const result2 = await generator.next();
        expect(result2).toEqual({ done: false, value: 2 });

        const result3 = await generator.next();
        expect(result3).toEqual({ done: false, value: 3 });

        // The null value should be included since finished function returns false
        const result4 = await generator.next();
        expect(result4).toEqual({ done: false, value: null });
    });

    it('should handle finished function that returns true on first value', async () => {
        const observe: Observe<number> = (notify) => {
            notify(1);
            notify(2);
            notify(3);
            return () => { };
        };
        const generator = toAsyncGenerator(observe, () => true);

        const values = await collectValues(generator);
        expect(values).toEqual([1]); // The first value is included before the finished check
    });

    it('should handle synchronous observe callback that finishes immediately', async () => {
        const observe: Observe<number> = (notify) => {
            notify(null as any); // Finish immediately
            return () => { };
        };

        const generator = toAsyncGenerator(observe);
        const values = await collectValues(generator);
        expect(values).toEqual([null]); // The null value is included before the finished check
    });

    it('should handle mixed sync/async with custom finished function', async () => {
        const [observe, doAsync] = createTestObservable(0, [1, 2, 3, 4, 5]);
        const generator = toAsyncGenerator(observe, (value) => value === 3);

        // Start collecting values
        const valuesPromise = collectValues(generator);

        // Trigger async values
        await doAsync();

        const values = await valuesPromise;
        expect(values).toEqual([0, 1, 2, 3]); // The finish value (3) is included
    });

    it('should handle return() after error', async () => {
        const [observe] = createTestObservable(undefined, [1, 2, 3]);
        const generator = toAsyncGenerator(observe, () => {
            throw new Error('Test error');
        });

        // Try to return after error
        const returnResult = await generator.return(undefined);
        expect(returnResult).toEqual({ done: true, value: undefined });
    });

    it('should handle throw() after return()', async () => {
        const [observe] = createTestObservable(undefined, [1, 2, 3]);
        const generator = toAsyncGenerator(observe);

        // Return first
        await generator.return(undefined);

        // Then throw
        const error = new Error('Test throw after return');
        await expect(generator.throw(error)).rejects.toThrow('Test throw after return');
    });

    it('should handle multiple rapid next() calls', async () => {
        const observe: Observe<number> = (notify) => {
            notify(1);
            notify(2);
            notify(3);
            notify(null as any); // Finish
            return () => { };
        };
        const generator = toAsyncGenerator(observe);

        // Rapid next() calls
        const promises = [
            generator.next(),
            generator.next(),
            generator.next(),
            generator.next()
        ];

        const results = await Promise.all(promises);
        expect(results).toEqual([
            { done: false, value: 1 },
            { done: false, value: 2 },
            { done: false, value: 3 },
            { done: false, value: null } // The null value is included before the finished check
        ]);
    });

    it('should handle finished function that throws on specific value', async () => {
        const observe: Observe<number> = (notify) => {
            notify(1);
            notify(2);
            notify(3);
            return () => { };
        };
        const generator = toAsyncGenerator(observe, (value) => {
            if (value === 2) throw new Error('Error on value 2');
            return false;
        });

        await expect(collectValues(generator)).rejects.toThrow('Error on value 2');
    });

    it('should handle errors in finished function with async observable', async () => {
        const observe: Observe<number> = (notify) => {
            // Emit values asynchronously
            setTimeout(() => {
                notify(1);
                notify(2);
            }, 0);
            return () => { };
        };

        const generator = toAsyncGenerator(observe, (value) => {
            if (value === 2) throw new Error('Test error');
            return false;
        });

        // Should get first value
        const result1 = await generator.next();
        expect(result1).toEqual({ done: false, value: 1 });

        // Second value should trigger error
        await expect(generator.next()).rejects.toThrow('Test error');
    });
}); 