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
import { assert } from 'riteway/vitest';
import { describe, test, beforeEach } from 'vitest';
import { createPersistedState } from './create-persisted-state.js';

describe('createPersistedState', () => {
  // Mock storage implementation
  class MockStorage implements Storage {
    private store: Record<string, string> = {};
    getItem(key: string): string | null {
      return this.store[key] || null;
    }
    setItem(key: string, value: string): void {
      this.store[key] = value;
    }
    clear(): void {
      this.store = {};
    }
    removeItem(key: string): void {
      delete this.store[key];
    }
    key(index: number): string | null {
      return Object.keys(this.store)[index] || null;
    }
    get length(): number {
      return Object.keys(this.store).length;
    }
  }

  let mockStorage: Storage;

  beforeEach(() => {
    mockStorage = new MockStorage();
  });

  test('should initialize with initial value when storage is empty', () => {
    const [observe, setter] = createPersistedState('test-key', 42 as number, mockStorage);

    let observedValue: number | undefined;
    observe((value) => {
      observedValue = value;
    });

    assert({
      given: 'initial value with empty storage',
      should: 'use provided initial value',
      actual: observedValue,
      expected: 42,
    });
  });

  test('should persist value updates to storage', () => {
    const [_observe, setter] = createPersistedState('test-key', 42 as number, mockStorage);

    setter(100);

    assert({
      given: 'value update',
      should: 'persist to storage',
      actual: JSON.parse(mockStorage.getItem('test-key') || 'null'),
      expected: 100,
    });
  });

  test('should load existing value from storage', () => {
    // First create and set a value
    const [_observe1, setter1] = createPersistedState('test-key', 42 as number, mockStorage);
    setter1(100);

    // Create new observe function with same key but different initial value
    const [observe2, _setter2] = createPersistedState('test-key', 42 as number, mockStorage);

    let observedValue: number | undefined;
    observe2((value) => {
      observedValue = value;
    });

    assert({
      given: 'existing value in storage',
      should: 'use stored value instead of initial value',
      actual: observedValue,
      expected: 100,
    });
  });

  test('should handle invalid JSON in storage', () => {
    mockStorage.setItem('test-key', 'invalid-json');

    const [observe, _setter] = createPersistedState('test-key', 42 as number, mockStorage);

    let observedValue: number | undefined;
    observe((value) => {
      observedValue = value;
    });

    assert({
      given: 'invalid JSON in storage',
      should: 'fall back to initial value',
      actual: observedValue,
      expected: 42,
    });
  });

  test('should notify multiple observers of updates', () => {
    const [observe, setter] = createPersistedState('test-key', 42 as number, mockStorage);

    const observed: number[] = [];
    const observed2: number[] = [];

    observe((value) => observed.push(value));
    observe((value) => observed2.push(value));

    setter(100);
    setter(200);

    assert({
      given: 'multiple observers',
      should: 'notify all observers of updates',
      actual: [observed, observed2],
      expected: [[42, 100, 200], [42, 100, 200]],
    });
  });
});
