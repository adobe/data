// © 2026 Adobe. MIT License. See /LICENSE for details.
import { memoize } from "./memoize.js";
import { preventParallelExecution } from "./prevent-parallel-execution.js";
import { describe, expect, it } from "vitest";

describe("Function", () => {
  describe("prevent parallel execution", () => {
    it("should block parallel execution and return same promise", async () => {
      let addCallCount = 0;
      async function add(a: number, b: number): Promise<number> {
        addCallCount++;
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(a + b);
          }, 100);
        });
      }

      async function testAddBlocksParallelExecution(addFn: typeof add) {
        addCallCount = 0;
        const promises = [addFn(1, 2), addFn(1, 2), addFn(1, 2)];
        const results = await Promise.all(promises);
        expect(results).toEqual([3, 3, 3]);
      }

      const addFn = preventParallelExecution(add);
      await testAddBlocksParallelExecution(addFn);
      // after all have completed... then another can execute
      addCallCount = 0;
      expect(await addFn(1, 2)).toEqual(3);
      expect(addCallCount).toEqual(1);
    });
  });

  describe("memoize", () => {
    it("should block parallel execution and return same promise", async () => {
      let addCallCount = 0;
      async function add(a: number, b: number): Promise<number> {
        addCallCount++;
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(a + b);
          }, 100);
        });
      }

      async function testAddBlocksParallelExecution(addFn: typeof add) {
        addCallCount = 0;
        const promises = [addFn(1, 2), addFn(1, 2), addFn(1, 2)];
        const results = await Promise.all(promises);
        expect(results).toEqual([3, 3, 3]);
      }

      //  now memoize the addFn and verify that it is cached.
      const addFn = memoize("addFn-v1", add);
      await testAddBlocksParallelExecution(addFn);
      // after all have completed... then another can execute
      addCallCount = 0;
      expect(await addFn(1, 2)).toEqual(3);
      // with memoize, the count should be 0 because we get a cached result.
      expect(addCallCount).toEqual(0);
    });

    it("should reuse cached result for repeated object references", () => {
      let callCount = 0;
      const multiply = memoize(({ value }: { value: number }) => {
        callCount++;
        return value * 2;
      });

      const input = { value: 2 };
      expect(multiply(input)).toEqual(4);
      expect(multiply(input)).toEqual(4);
      expect(callCount).toEqual(1);

      expect(multiply({ value: 2 })).toEqual(4);
      expect(callCount).toEqual(2);
    });
  });
});
