// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, expect, it } from "vitest";
import { Observe } from "../../observe/index.js";
import { Schema } from "../../schema/index.js";
import { Service } from "../service.js";
import { Assert } from "../../types/assert.js";
import { EquivalentTypes } from "../../types/types.js";
import { AsyncDataService } from "./async-data-service.js";

const schema = {
  type: "object",
  properties: {
    count: { type: "observe", value: { type: "number" } },
    reset: { type: "function" },
    foo: {
      type: "object",
      properties: {
        state: {
          type: "object",
          properties: {
            a: { type: "observe", value: { type: "string" } },
            b: { type: "observe", value: { type: "boolean" } },
          },
          required: ["a", "b"],
        },
        save: { type: "function", signature: { returns: { type: "promise", value: { type: "null" } } } },
      },
      required: ["state", "save"],
    },
    actionsOnly: {
      type: "object",
      properties: { go: { type: "function" } },
      required: ["go"],
    },
    "dotted.key": { type: "observe", value: { type: "number" } },
  },
  required: ["count", "reset", "foo", "actionsOnly", "dotted.key"],
} as const satisfies Schema;

interface TestService extends Service {
  readonly schema: Observe<Schema>;
  readonly count: Observe<number>;
  readonly reset: () => void;
  readonly foo: {
    readonly state: { readonly a: Observe<string>; readonly b: Observe<boolean> };
    readonly save: () => Promise<null>;
  };
  readonly actionsOnly: { readonly go: () => void };
  readonly "dotted.key": Observe<number>;
  readonly optional?: Observe<string>;
}

// Observe members become their values, actions and action-only groups are omitted,
// optional members stay optional.
type _CheckState = Assert<EquivalentTypes<AsyncDataService.State<TestService>, {
  readonly count: number;
  readonly foo: { readonly state: { readonly a: string; readonly b: boolean } };
  readonly "dotted.key": number;
  readonly optional?: string;
}>>;

function createTestService() {
  const [count, setCount] = Observe.createState(1);
  const [a, setA] = Observe.createState("x");
  const [b] = Observe.createState(true);
  const [dotted] = Observe.createState(7);
  const [schemaState, setSchema] = Observe.createState<Schema>(schema);
  const service: TestService = {
    serviceName: "test",
    schema: schemaState,
    count,
    reset: () => setCount(0),
    foo: { state: { a, b }, save: async () => null },
    actionsOnly: { go: () => {} },
    "dotted.key": dotted,
  };
  return { service, setCount, setA, setSchema };
}

describe("AsyncDataService.toState", () => {
  it("combines every nested observe member into the service's shape", () => {
    const { service } = createTestService();
    const values: unknown[] = [];
    const unobserve = AsyncDataService.toState(service)((value) => values.push(value));
    expect(values).toEqual([{ count: 1, foo: { state: { a: "x", b: true } }, "dotted.key": 7 }]);
    unobserve();
  });

  it("re-emits when any member changes and stops after unobserve", () => {
    const { service, setCount, setA } = createTestService();
    const values: AsyncDataService.State<TestService>[] = [];
    const unobserve = AsyncDataService.toState(service)((value) => values.push(value));
    setA("y");
    setCount(2);
    expect(values.map((value) => [value.count, value.foo.state.a])).toEqual([[1, "x"], [1, "y"], [2, "y"]]);
    unobserve();
    setCount(3);
    expect(values).toHaveLength(3);
  });

  it("waits until every member has a value", () => {
    const [late, setLate] = Observe.createState<number>();
    const service = {
      schema: Observe.fromConstant<Schema>({
        type: "object",
        properties: { now: { type: "observe" }, late: { type: "observe" } },
      }),
      now: Observe.fromConstant(1),
      late,
    };
    const values: unknown[] = [];
    AsyncDataService.toState(service)((value) => values.push(value));
    expect(values).toEqual([]);
    setLate(2);
    expect(values).toEqual([{ now: 1, late: 2 }]);
  });

  it("skips members the schema describes but the instance lacks", () => {
    const service = {
      schema: Observe.fromConstant<Schema>({
        type: "object",
        properties: { present: { type: "observe" }, missing: { type: "observe" } },
      }),
      present: Observe.fromConstant("here"),
    };
    const values: unknown[] = [];
    AsyncDataService.toState(service)((value) => values.push(value));
    expect(values).toEqual([{ present: "here" }]);
  });

  it("emits an empty object for a service with no observe members", () => {
    const service = { schema: Observe.fromConstant<Schema>({ type: "object", properties: { go: { type: "function" } } }), go: () => {} };
    const values: unknown[] = [];
    AsyncDataService.toState(service)((value) => values.push(value));
    expect(values).toEqual([{}]);
  });

  it("re-derives the member set when the schema changes", () => {
    const { service, setSchema, setA } = createTestService();
    const values: unknown[] = [];
    const unobserve = AsyncDataService.toState(service)((value) => values.push(value));
    setSchema({ type: "object", properties: { count: { type: "observe" } } });
    expect(values.at(-1)).toEqual({ count: 1 });
    // The previous member set's subscriptions were released.
    setA("z");
    expect(values).toHaveLength(2);
    unobserve();
  });
});
