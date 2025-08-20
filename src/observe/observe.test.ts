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
import { assert } from "riteway/vitest";
import { describe, test } from "vitest";

import {
  Notify,
  Observe,
  createObservableState,
  fromConstant,
  fromArray,
  fromProperties,
  fromPromise,
  fromPromiseWithError,
  withCache,
  withDeduplicate,
  withDefault,
  withFilter,
  withMap,
  withOptional,
} from "./index.js";
import { toProperties } from "./to-properties.js";
import { withAsyncMap } from "./with-async-map.js";

function createTestObservable<T>(
  sync: T | undefined,
  async: Array<T>
): [Observe<T>, () => Promise<void>] {
  const observers = new Set<Notify<T>>();
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
    },
  ];
}

async function testObserver<T>(props: {
  given: string;
  expected: {
    sync: T | undefined;
    async: Array<T>;
  };
  observable: Observe<T>;
  doAsync: () => Promise<void>;
}) {
  const { given, expected, observable: observer, doAsync } = props;
  const actual = { sync: undefined as T | undefined, async: [] as Array<T> };
  let isSync = true;
  const unobserve = observer((value) => {
    if (isSync) {
      actual.sync = value;
    } else {
      actual.async.push(value);
    }
  });
  isSync = false;
  await doAsync();
  unobserve();
  assert({
    given,
    should: `observe ${JSON.stringify(expected)}`,
    actual,
    expected,
  });
}

export async function testObservableFilter<T, U>(props: {
  given: string;
  filter: (observable: Observe<T>) => Observe<U>;
  input: [T | undefined, Array<T>];
  output: [U | undefined, Array<U>];
}) {
  const { given, input, filter, output } = props;
  const [observer, done] = createTestObservable(input[0], input[1]);
  const filtered = filter(observer);
  await testObserver({
    given,
    expected: {
      sync: output[0],
      async: output[1],
    },
    observable: filtered,
    doAsync: done,
  });
}

describe("observable", () => {
  test("createTestObservable", async () => {
    const [observer, done] = createTestObservable(1, [2, 3]);
    await testObserver({
      given: "createTestObservable",
      expected: {
        sync: 1,
        async: [2, 3],
      },
      observable: observer,
      doAsync: done,
    });
  });
  test("fromConstant", async () => {
    await testObserver({
      given: "fromConstant",
      expected: {
        sync: 1,
        async: [],
      },
      observable: fromConstant(1),
      doAsync: () => Promise.resolve(),
    });
  });
  test("withOptional", async () => {
    const observable = withOptional(fromPromise(() => Promise.resolve(1)));
    //  manually test that we DO get a sync value callback.
    {
      let syncCallback = false;
      let syncValue: number | undefined;
      observable((value) => {
        syncValue = value;
        syncCallback = true;
      })();
      assert({
        given: "withOptional",
        should: "get a sync value callback",
        actual: [syncCallback, syncValue],
        expected: [true, undefined],
      });
    }

    await testObserver({
      given: "fromOptional",
      expected: {
        sync: undefined,
        async: [1],
      },
      observable,
      doAsync: () => Promise.resolve(),
    });
  });

  test("fromObservableProperties sync", async () => {
    const observable = fromProperties({
      a: fromConstant(1),
      b: fromConstant(2),
      c: fromConstant(3),
    });
    await testObserver({
      given:
        "fromObservableProperties called with all sync values should yield sync result",
      expected: {
        sync: { a: 1, b: 2, c: 3 },
        async: [],
      },
      observable,
      doAsync: () => Promise.resolve(),
    });
  });

  test("fromObservableProperties optional called first", async () => {
    const [observer1, doAsync1] = createTestObservable(undefined, [1, 2, 3]);
    const [observer2, doAsync2] = createTestObservable("0", ["1", "2", "3"]);
    const observable = fromProperties({
      a: observer1,
      b: withOptional(observer2),
    });
    await testObserver({
      given: "pick",
      expected: {
        sync: undefined,
        async: [
          { a: 1, b: "3" },
          { a: 2, b: "3" },
          { a: 3, b: "3" },
        ],
      },
      observable,
      doAsync: async () => {
        await doAsync2();
        await doAsync1();
      },
    });
  });
  test("fromObservableProperties optional called second", async () => {
    const [observer1, doAsync1] = createTestObservable(undefined, [1, 2, 3]);
    const [observer2, doAsync2] = createTestObservable(undefined, [
      "1",
      "2",
      "3",
    ]);
    const observable = fromProperties({
      a: observer1,
      b: withOptional(observer2),
    });
    await testObserver({
      given: "pick",
      expected: {
        sync: undefined,
        async: [
          { a: 1, b: undefined },
          { a: 2, b: undefined },
          { a: 3, b: undefined },
          { a: 3, b: "1" },
          { a: 3, b: "2" },
          { a: 3, b: "3" },
        ],
      },
      observable,
      doAsync: async () => {
        await doAsync1();
        await doAsync2();
      },
    });
  });

  test("fromObservableArray sync", async () => {
    const observable = fromArray([
      fromConstant(1),
      fromConstant(2),
      fromConstant(3),
    ]);
    await testObserver({
      given:
        "fromObservableArray called with all sync values should yield sync result",
      expected: {
        sync: [1, 2, 3],
        async: [],
      },
      observable,
      doAsync: () => Promise.resolve(),
    });
  });

  test("fromPromise", async () => {
    const promise = Promise.resolve(1);

    await testObserver({
      given: "fromPromise",
      expected: {
        sync: undefined,
        async: [1],
      },
      observable: fromPromise(() => promise),
      doAsync: async () => {
        await promise;
      },
    });
  });
  test("fromPromiseWithError", async () => {
    const error = new Error("error");
    const promise = Promise.reject(error);

    await testObserver({
      given: "fromPromiseWithError",
      expected: {
        sync: undefined,
        async: [error],
      },
      observable: fromPromiseWithError(() => promise),
      doAsync: async () => {
        try {
          await promise;
        } catch (_error) {
          // ignore
        }
      },
    });
  });
  test("cache", async () => {
    //  create a promise
    const promise = Promise.resolve(1);
    //  create the observable with a cache
    const observable = withCache(fromPromise(() => promise));
    //  wait for the first observable value to return.
    const first = await new Promise<number>((resolve) => {
      const unobserve = observable((value) => {
        resolve(value);
        unobserve();
      });
    });
    assert({
      given: "first return value from cache",
      should: "be 1",
      actual: first,
      expected: 1,
    });
    //  now that it's primed let's verify we get a synchronous result.
    let syncValue: number | undefined;
    observable((value) => {
      syncValue = value;
    })();
    assert({
      given: "synchronous return value from primed cache",
      should: "be 1",
      actual: syncValue,
      expected: 1,
    });
  });
  test("deduplicate shallow compare", async () => {
    await testObservableFilter({
      given: "an Observable with cache shallow",
      filter: withDeduplicate,
      input: [1, [1, 2, 2, 2, 3, 3, 4]],
      output: [1, [2, 3, 4]],
    });
  });
  // test("deduplicate deep compare", async () => {
  //   await testObservableFilter({
  //     given: "an Observable with deduplicate data",
  //     filter: withDeduplicateData,
  //     input: [
  //       { a: 1 },
  //       [{ a: 1 }, { a: 2 }, { a: 2 }, { a: 3 }, { a: 3 }, { a: 4 }],
  //     ],
  //     output: [{ a: 1 }, [{ a: 2 }, { a: 3 }, { a: 4 }]],
  //   });
  // });
  test("withDefault", async () => {
    await testObservableFilter({
      given: "an Observable withDefault",
      filter: observable => withDefault(observable, 0),
      input: [undefined, [1, undefined, 3]],
      output: [0, [1, 0, 3]],
    });
  });
  test("withMap", async () => {
    await testObservableFilter({
      given: "an Observable withMap",
      filter: (observable) => withMap(observable, (value) => value * 2),
      input: [1, [1, 2, 3]],
      output: [2, [2, 4, 6]],
    });
  });
  test("withMap passes through undefined values", async () => {
    await testObservableFilter({
      given: "an Observable withMap that passes through undefined values",
      filter: (observable) => withMap(observable, (value) =>
        value > 0 ? value * 2 : undefined
      ),
      input: [1, [-1, 2, -3, 4]],
      output: [2, [undefined, 4, undefined, 8]],
    });
  });
  test("withMap passes through all undefined values", async () => {
    await testObservableFilter({
      given: "an Observable withMap that passes through all undefined values",
      filter: (observable) => withMap(observable, (value) => undefined),
      input: [1, [2, 3, 4]],
      output: [undefined, [undefined, undefined, undefined]],
    });
  });
  test("withFilter filters undefined values", async () => {
    await testObservableFilter({
      given: "an Observable withFilter that filters out undefined values",
      filter: (observable) => withFilter(observable, (value) =>
        value > 0 ? value * 2 : undefined
      ),
      input: [1, [-1, 2, -3, 4]],
      output: [2, [4, 8]],
    });
  });
  test("withFilter filters all values", async () => {
    await testObservableFilter({
      given: "an Observable withFilter that filters out all values",
      filter: (observable) => withFilter(observable, (value) => undefined),
      input: [1, [2, 3, 4]],
      output: [undefined, []],
    });
  });
  test("withFilter filters based on condition", async () => {
    await testObservableFilter({
      given: "an Observable withFilter that filters based on condition",
      filter: (observable) => withFilter(observable, (value) =>
        value % 2 === 0 ? value : undefined
      ),
      input: [1, [2, 3, 4, 5, 6]],
      output: [undefined, [2, 4, 6]],
    });
  });
  test("withAsyncMap", async () => {
    await testObservableFilter({
      given: "an Observable withAsyncMap",
      filter: (observable) => withAsyncMap(observable, async (value) => value * 2),
      input: [1, [1, 2, 3]],
      output: [undefined, [2, 2, 4, 6]],
    });
  });
  test("withCache shares base observable", async () => {
    let observeCount = 0;
    const observer = withCache((callback: Notify<number>) => {
      observeCount++;
      callback(42);
      return () => { };
    });

    let observe1 = -1;
    observer((value) => {
      observe1 = value;
    });
    let observe2 = -1;
    observer((value) => {
      observe2 = value;
    });

    assert({
      given: "withShared called multiple times",
      should: "base observable to be called only once",
      actual: [observe1, observe2, observeCount],
      expected: [42, 42, 1],
    });
  });
  test("toObservableProperties", async () => {
    const [observable, setState] = createObservableState({ a: 1, b: "foo" });
    const properties = toProperties(observable, ["a", "b"]);
    const observedValues: Array<any> = [];
    const observer = (value: any) => {
      observedValues.push(value);
    };
    properties.a(observer);
    properties.b(observer);
    assert({
      given: "toObservableProperties",
      should: "observe values",
      actual: observedValues,
      expected: [1, "foo"],
    });
    setState({ a: 2, b: "bar" });
    assert({
      given: "toObservableProperties",
      should: "observe new values",
      actual: observedValues,
      expected: [1, "foo", 2, "bar"],
    });
    setState({ a: 2, b: "bar" });
    assert({
      given: "toObservableProperties",
      should: "not observe unchanged values",
      actual: observedValues,
      expected: [1, "foo", 2, "bar"],
    });
    setState({ a: 3, b: "bar" });
    assert({
      given: "toObservableProperties",
      should: "observe only changed values",
      actual: observedValues,
      expected: [1, "foo", 2, "bar", 3],
    });
  })
});

describe("observable", () => {
  test("createObservableWithSetter", async () => {
    const [observable, setter] = createObservableState<number>();

    const observedValues = [] as number[];
    const unobserve = observable((value) => {
      observedValues.push(value);
    });

    const values = [2, 3, 4];

    // Set subsequent values
    values.forEach((value) => setter(value));

    assert({
      given: "createObservableWithSetter",
      should: "observe values",
      actual: observedValues,
      expected: values,
    });

    unobserve();
    values.forEach((value) => setter(value));

    assert({
      given: "createObservableWithSetter",
      should: "not observe values after unobserve",
      actual: observedValues,
      expected: values,
    });
  });
});
