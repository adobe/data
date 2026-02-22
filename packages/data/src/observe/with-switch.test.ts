// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, test, expect, assertType } from "vitest";
import { withSwitch } from "./with-switch.js";
import { fromConstant } from "./from-constant.js";
import { createState } from "./create-state.js";
import type { Observe } from "./index.js";

describe("withSwitch", () => {
  test("should switch and observe the selected observable", () => {
    const record = {
      a: fromConstant(1),
      b: fromConstant(2),
      c: fromConstant(3),
    };
    const key = fromConstant("b" as const);
    const picked = withSwitch(record, key);

    let result: number | undefined;
    picked((value) => {
      result = value;
    })();

    expect(result).toBe(2);
  });

  test("should switch observables when key changes", () => {
    const record = {
      a: fromConstant(10),
      b: fromConstant(20),
      c: fromConstant(30),
    };
    const [key, setKey] = createState<"a" | "b" | "c">("a");
    const picked = withSwitch(record, key);

    const values: number[] = [];
    const unsubscribe = picked((value) => {
      values.push(value);
    });

    setKey("b");
    setKey("c");

    unsubscribe();

    expect(values).toEqual([10, 20, 30]);
  });

  test("should unsubscribe from previous observable when key changes", () => {
    const [observableA, setA] = createState(100);
    const [observableB, setB] = createState(200);
    const record = { a: observableA, b: observableB };
    const [key, setKey] = createState<"a" | "b">("a");
    const picked = withSwitch(record, key);

    const values: number[] = [];
    const unsubscribe = picked((value) => {
      values.push(value);
    });

    setA(101); // Should be observed
    setKey("b"); // Switch to b
    setA(102); // Should NOT be observed (unsubscribed from a)
    setB(201); // Should be observed

    unsubscribe();

    expect(values).toEqual([100, 101, 200, 201]);
  });

  test("should clean up all subscriptions on unobserve", () => {
    const [observableA, setA] = createState(1);
    const [observableB, setB] = createState(2);
    const record = { a: observableA, b: observableB };
    const [key, setKey] = createState<"a" | "b">("a");
    const picked = withSwitch(record, key);

    const values: number[] = [];
    const unsubscribe = picked((value) => {
      values.push(value);
    });

    setA(10);
    unsubscribe();

    // After unsubscribe, no further notifications
    setA(20);
    setB(30);
    setKey("b");

    expect(values).toEqual([1, 10]);
  });

  test("should handle rapid key changes", () => {
    const record = {
      x: fromConstant("first"),
      y: fromConstant("second"),
      z: fromConstant("third"),
    };
    const [key, setKey] = createState<"x" | "y" | "z">("x");
    const picked = withSwitch(record, key);

    const values: string[] = [];
    const unsubscribe = picked((value) => {
      values.push(value);
    });

    setKey("y");
    setKey("z");
    setKey("x");
    setKey("z");

    unsubscribe();

    expect(values).toEqual(["first", "second", "third", "first", "third"]);
  });

  test("should throw error when key is not in record", () => {
    const record = {
      a: fromConstant(1),
      b: fromConstant(2),
    };
    const [key, setKey] = createState<string>("a");
    const picked = withSwitch(record, key);

    const unsubscribe = picked(() => {});

    expect(() => {
      setKey("invalid");
    }).toThrow('Key "invalid" not found in observable record');

    unsubscribe();
  });

  test("type inference: should infer union type from subset of keys", () => {
    // Compile-time type test
    const record = {
      a: fromConstant(true),
      b: fromConstant("hello"),
      c: fromConstant(42),
    };
    
    const key = fromConstant("a" as "a" | "b");
    const result = withSwitch(record, key);
    
    // Type should be Observe<boolean | string>, not Observe<boolean | string | number>
    assertType<Observe<boolean | string>>(result);
  });

  test("type inference: should work with all keys", () => {
    // Compile-time type test
    const record = {
      a: fromConstant(true),
      b: fromConstant("hello"),
      c: fromConstant(42),
    };
    
    const key = fromConstant("a" as "a" | "b" | "c");
    const result = withSwitch(record, key);
    
    // Type should be Observe<boolean | string | number>
    assertType<Observe<boolean | string | number>>(result);
  });

  test("type inference: should work with single key", () => {
    // Compile-time type test
    const record = {
      a: fromConstant(true),
      b: fromConstant("hello"),
      c: fromConstant(42),
    };
    
    const key = fromConstant("b" as const);
    const result = withSwitch(record, key);
    
    // Type should be Observe<string>
    assertType<Observe<string>>(result);
  });
});
