// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from './debounce.js';

describe('debounce', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('basic debouncing (trailing edge)', () => {
        it('should delay function execution', () => {
            const fn = vi.fn();
            const debounced = debounce(fn, 100);

            debounced('test');
            expect(fn).not.toHaveBeenCalled();

            vi.advanceTimersByTime(99);
            expect(fn).not.toHaveBeenCalled();

            vi.advanceTimersByTime(1);
            expect(fn).toHaveBeenCalledWith('test');
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('should only execute the last call when called multiple times rapidly', () => {
            const fn = vi.fn();
            const debounced = debounce(fn, 100);

            debounced('first');
            debounced('second');
            debounced('third');

            vi.advanceTimersByTime(100);

            expect(fn).toHaveBeenCalledWith('third');
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('should reset timer on each call', () => {
            const fn = vi.fn();
            const debounced = debounce(fn, 100);

            debounced('test1');
            vi.advanceTimersByTime(50);

            debounced('test2');
            vi.advanceTimersByTime(50);
            expect(fn).not.toHaveBeenCalled();

            vi.advanceTimersByTime(50);
            expect(fn).toHaveBeenCalledWith('test2');
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('should preserve function arguments with complex types', () => {
            const fn = vi.fn();
            const debounced = debounce(fn, 100);

            const complexArg = { id: 1, data: [1, 2, 3], nested: { value: 'test' } };
            debounced('string', 42, complexArg, true);

            vi.advanceTimersByTime(100);

            expect(fn).toHaveBeenCalledWith('string', 42, complexArg, true);
        });
    });

    describe('leading edge execution', () => {
        it('should execute immediately when leading is true', () => {
            const fn = vi.fn();
            const debounced = debounce(fn, 100, { leading: true });

            debounced('test');
            expect(fn).toHaveBeenCalledWith('test');
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('should not execute again on trailing edge when leading is true and trailing is false', () => {
            const fn = vi.fn();
            const debounced = debounce(fn, 100, { leading: true, trailing: false });

            debounced('test');
            expect(fn).toHaveBeenCalledTimes(1);

            vi.advanceTimersByTime(100);
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('should execute both leading and trailing when both are true', () => {
            const fn = vi.fn();
            const debounced = debounce(fn, 100, { leading: true, trailing: true });

            debounced('test1');
            expect(fn).toHaveBeenCalledWith('test1');

            debounced('test2');
            vi.advanceTimersByTime(100);

            expect(fn).toHaveBeenCalledWith('test2');
            expect(fn).toHaveBeenCalledTimes(2);
        });

        it('should not execute on leading edge for subsequent rapid calls', () => {
            const fn = vi.fn();
            const debounced = debounce(fn, 100, { leading: true });

            debounced('first');
            expect(fn).toHaveBeenCalledTimes(1);

            debounced('second');
            debounced('third');
            expect(fn).toHaveBeenCalledTimes(1); // Still only the leading call

            vi.advanceTimersByTime(100);
            expect(fn).toHaveBeenCalledTimes(2); // Now trailing edge executes
            expect(fn).toHaveBeenLastCalledWith('third');
        });
    });

    describe('maxWait functionality', () => {
        it('should force execution after maxWait time', () => {
            const fn = vi.fn();
            const debounced = debounce(fn, 100, { maxWait: 200 });

            // Add debug logging
            const originalConsoleLog = console.log;
            const logs: string[] = [];
            console.log = (...args) => logs.push(args.join(' '));

            debounced('test1');
            console.log('Called with test1 at 0ms');

            vi.advanceTimersByTime(150);
            console.log('Advanced 150ms');

            debounced('test2');
            console.log('Called with test2 at 150ms');

            vi.advanceTimersByTime(50); // Total 200ms from first call
            console.log('Advanced final 50ms (total 200ms)');

            console.log = originalConsoleLog;

            // Log debug info if test fails
            if (fn.mock.calls.length > 0) {
                console.log('Function was called with:', fn.mock.calls[0]);
                console.log('Debug logs:', logs);
            }

            expect(fn).toHaveBeenCalledWith('test2');
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('should not exceed maxWait even with continuous calls', () => {
            const fn = vi.fn();
            const debounced = debounce(fn, 100, { maxWait: 250 });

            // Continuous calls every 50ms
            for (let i = 0; i < 10; i++) {
                debounced(`call${i}`);
                vi.advanceTimersByTime(50);

                if (i === 4) { // At 250ms total
                    expect(fn).toHaveBeenCalledTimes(1);
                    expect(fn).toHaveBeenCalledWith('call4');
                }
            }
        });
    });

    describe('cancel method', () => {
        it('should cancel pending execution', () => {
            const fn = vi.fn();
            const debounced = debounce(fn, 100);

            debounced('test');
            expect(debounced.pending()).toBe(true);

            debounced.cancel();
            expect(debounced.pending()).toBe(false);

            vi.advanceTimersByTime(100);
            expect(fn).not.toHaveBeenCalled();
        });

        it('should reset internal state', () => {
            const fn = vi.fn();
            const debounced = debounce(fn, 100);

            debounced('test1');
            debounced.cancel();

            // After cancel, next call should behave like first call
            debounced('test2');
            vi.advanceTimersByTime(100);

            expect(fn).toHaveBeenCalledWith('test2');
            expect(fn).toHaveBeenCalledTimes(1);
        });
    });

    describe('flush method', () => {
        it('should immediately execute pending function', () => {
            const fn = vi.fn((x: string) => `result: ${x}`);
            const debounced = debounce(fn, 100);

            debounced('test');
            const result = debounced.flush();

            expect(fn).toHaveBeenCalledWith('test');
            expect(result).toBe('result: test');
            expect(debounced.pending()).toBe(false);
        });

        it('should return undefined if no pending execution', () => {
            const fn = vi.fn((x: string) => `result: ${x}`);
            const debounced = debounce(fn, 100);

            const result = debounced.flush();
            expect(result).toBeUndefined();
            expect(fn).not.toHaveBeenCalled();
        });

        it('should prevent normal timer execution after flush', () => {
            const fn = vi.fn();
            const debounced = debounce(fn, 100);

            debounced('test');
            debounced.flush();

            vi.advanceTimersByTime(100);
            expect(fn).toHaveBeenCalledTimes(1); // Only from flush, not timer
        });
    });

    describe('pending method', () => {
        it('should return true when execution is pending', () => {
            const fn = vi.fn();
            const debounced = debounce(fn, 100);

            expect(debounced.pending()).toBe(false);

            debounced('test');
            expect(debounced.pending()).toBe(true);

            vi.advanceTimersByTime(100);
            expect(debounced.pending()).toBe(false);
        });

        it('should return false after cancel', () => {
            const fn = vi.fn();
            const debounced = debounce(fn, 100);

            debounced('test');
            expect(debounced.pending()).toBe(true);

            debounced.cancel();
            expect(debounced.pending()).toBe(false);
        });

        it('should return false after flush', () => {
            const fn = vi.fn();
            const debounced = debounce(fn, 100);

            debounced('test');
            expect(debounced.pending()).toBe(true);

            debounced.flush();
            expect(debounced.pending()).toBe(false);
        });
    });

    describe('type safety', () => {
        it('should preserve function signature for simple functions', () => {
            const fn = vi.fn((a: string, b: number) => `${a}: ${b}`);
            const debounced = debounce(fn, 100);

            // Type checking happens at compile time, but we can test runtime behavior
            debounced('test', 42);
            vi.advanceTimersByTime(100);

            expect(fn).toHaveBeenCalledWith('test', 42);
        });

        it('should work with functions that return promises', () => {
            const fn = vi.fn(async (x: string) => `async result: ${x}`);
            const debounced = debounce(fn, 100);

            debounced('test');
            const result = debounced.flush();

            expect(result).toBeInstanceOf(Promise);
        });

        it('should work with void functions', () => {
            const fn = vi.fn((x: string): void => {
                console.log(x);
            });
            const debounced = debounce(fn, 100);

            debounced('test');
            const result = debounced.flush();

            expect(result).toBeUndefined();
            expect(fn).toHaveBeenCalledWith('test');
        });
    });

    describe('edge cases', () => {
        it('should handle zero wait time', () => {
            const fn = vi.fn();
            const debounced = debounce(fn, 0);

            debounced('test');
            vi.advanceTimersByTime(0);

            expect(fn).toHaveBeenCalledWith('test');
        });

        it('should handle very large wait times', () => {
            const fn = vi.fn();
            const debounced = debounce(fn, 1000000);

            debounced('test');
            vi.advanceTimersByTime(999999);
            expect(fn).not.toHaveBeenCalled();

            vi.advanceTimersByTime(1);
            expect(fn).toHaveBeenCalledWith('test');
        });

        it('should handle functions with no arguments', () => {
            const fn = vi.fn(() => 'no args');
            const debounced = debounce(fn, 100);

            debounced();
            vi.advanceTimersByTime(100);

            expect(fn).toHaveBeenCalledWith();
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('should handle functions that throw errors', () => {
            const fn = vi.fn((arg: string) => {
                throw new Error('Test error');
            });
            const debounced = debounce(fn, 100);

            debounced('test');

            expect(() => {
                vi.advanceTimersByTime(100);
            }).toThrow('Test error');

            expect(fn).toHaveBeenCalledWith('test');
        });

        it('should handle multiple debounced functions independently', () => {
            const fn1 = vi.fn();
            const fn2 = vi.fn();
            const debounced1 = debounce(fn1, 100);
            const debounced2 = debounce(fn2, 200);

            debounced1('test1');
            debounced2('test2');

            vi.advanceTimersByTime(100);
            expect(fn1).toHaveBeenCalledWith('test1');
            expect(fn2).not.toHaveBeenCalled();

            vi.advanceTimersByTime(100);
            expect(fn2).toHaveBeenCalledWith('test2');
        });
    });
});
