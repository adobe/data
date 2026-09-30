// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import type { Entity } from "@adobe/data/ecs";
import type { MatchOptions } from "../match/match.js";
import { matches } from "../match/match.js";
import { discoverTransitions } from "./discover.js";
import { expectAfter } from "./expect-after.js";
import { expectThrows } from "./expect-throws.js";
import type { SchemaSource } from "./refify.js";
import { resolveArgs } from "./resolve-args.js";
import { resolver } from "./resolve.js";
import { recordArgServices, splitAndRecordServices, expectEffects } from "./record-effects.js";
import type { Effects } from "./types.js";

type SystemFn = () => void | Promise<void>;
type SpecFn = (state: object, args: unknown) => object | Promise<object>;

// The slice of a system database the runner drives.
export type SystemDatabase<StoreT> = {
  readonly store: StoreT;
  readonly system: {
    readonly order: readonly (readonly string[])[];
    readonly functions: Readonly<Record<string, SystemFn | null | undefined>>;
  };
};

export type SystemCase = {
  readonly name: string;
  readonly before: object;
  readonly args?: unknown;
  readonly after?: object;
  readonly effects?: Effects<Record<string, unknown>>;
  readonly throws?: true | string;
};

export interface SystemRunConfig<State, StoreT> {
  // A fresh system database with these services injected (per-case recording doubles).
  readonly makeDb: (services: Record<string, object>) => SystemDatabase<StoreT>;
  readonly fromState: (store: StoreT, state: State) => ReadonlyMap<unknown, Entity> | void;
  readonly toState: (store: StoreT) => State;
  readonly initial: State;
  // The adapted per-system `{ fn, cases }` map (see `adaptCases`), keyed by system name.
  readonly systems: Record<string, Record<string, unknown>>;
  // Whole-frame cases, adapted the same way. A factory, so every run gets fresh
  // recording doubles and one run never drains another's response schedule.
  readonly frameCases: () => readonly SystemCase[];
  // One writer per frame data arg: how a case's arg reaches the store.
  readonly args: Readonly<Record<string, (db: SystemDatabase<StoreT>, value: unknown) => void>>;
  // System name → why the spec does not model it.
  readonly unmodelled: Readonly<Record<string, string>>;
  readonly match?: MatchOptions;
}

const SCHEDULER = "schedulerSystem";

// Write the case's data args into the store; services already arrived as doubles.
const writeArgs = <StoreT>(
  db: SystemDatabase<StoreT>,
  input: Record<string, unknown>,
  writers: SystemRunConfig<unknown, StoreT>["args"],
): void => {
  for (const [key, value] of Object.entries(input)) writers[key]?.(db, value);
};

// Conform a real-time feature's systems. Each spec system function conforms by running
// just the same-named ECS system on a seeded store. Each frame case conforms twice:
// the paired spec functions folded in `db.system.order` must give `after`, and so must
// one real frame. The order comes only from the systems' `schedule` declarations.
// Unmodelled systems are skipped on both sides and listed as skipped tests.
export function runSystems<State, StoreT extends SchemaSource>(config: SystemRunConfig<State, StoreT>): void {
  const systems = discoverTransitions(config.systems);
  const unmodelled = new Set(Object.keys(config.unmodelled));
  const order = config.makeDb({}).system.order;
  const orderNames = order.flat().filter((name) => name !== SCHEDULER);

  const unaccounted = orderNames.filter((name) => !systems.has(name) && !unmodelled.has(name));
  const unknown = [...systems.keys()].filter((name) => !orderNames.includes(name));
  if (unaccounted.length > 0 || unknown.length > 0) {
    describe("every system is modelled or declared unmodelled", () => {
      for (const name of unaccounted) {
        it(name, () => {
          throw new Error(`system "${name}" has no spec function and is not declared unmodelled`);
        });
      }
      for (const name of unknown) {
        it(name, () => {
          throw new Error(`spec system "${name}" names no ECS system`);
        });
      }
    });
  }

  for (const [name, reason] of Object.entries(config.unmodelled)) {
    describe(`${name} system`, () => {
      it.skip(`unmodelled — ${reason}`, () => {});
    });
  }

  const seed = (testCase: SystemCase) => {
    const { services, input, calls } = splitAndRecordServices(testCase.args);
    const before = { ...(config.initial as object), ...testCase.before } as State;
    const db = config.makeDb(services);
    return { db, before, input, calls, resolve: resolver(config.fromState(db.store, before)) };
  };

  const expectCase = (db: SystemDatabase<StoreT>, before: State, testCase: SystemCase, calls: Parameters<typeof expectEffects>[0]) => {
    expectAfter(config.toState(db.store), before as object, testCase.after ?? {}, db.store, config.match);
    expectEffects(calls, testCase.effects);
  };

  for (const [name, paired] of systems) {
    describe(`${name} system conforms`, () => {
      for (const raw of paired.cases) {
        const testCase = raw as SystemCase;
        it(testCase.name, async () => {
          const { db, before, input, calls, resolve } = seed(testCase);
          writeArgs(db, resolveArgs(input, paired.argsSchema, resolve) as Record<string, unknown>, config.args);
          const fn = db.system.functions[name];
          if (typeof fn !== "function") throw new Error(`system "${name}" is init-only; declare it unmodelled`);
          if (testCase.throws !== undefined) {
            await expectThrows(() => fn(), testCase.throws);
            return;
          }
          await fn();
          expectCase(db, before, testCase, calls);
        });
      }
    });
  }

  const frameCases = config.frameCases();
  if (frameCases.length === 0) return;

  // The modelled systems of each tier, in the order the scheduler runs them.
  const tiers = order.map((tier) => tier.filter((name) => name !== SCHEDULER && systems.has(name)));

  // Fold the paired spec functions over a tier's systems in the given order.
  const foldTier = async (state: object, names: readonly string[], args: unknown): Promise<object> => {
    let next = state;
    for (const name of names) next = { ...next, ...(await (systems.get(name)!.fn as SpecFn)(next, args)) };
    return next;
  };

  describe("frame conforms", () => {
    frameCases.forEach((named, index) => {
      const fresh = (): SystemCase => config.frameCases()[index]!;
      it(`${named.name} (spec systems in schedule order)`, async () => {
        const testCase = fresh();
        const { args, calls } = recordArgServices(testCase.args);
        const before = { ...(config.initial as object), ...testCase.before };
        let state: object = before;
        for (const tier of tiers) {
          const forward = await foldTier(state, tier, args);
          if (tier.length > 1) {
            // Systems sharing a tier have no declared order, so they must commute.
            const reverse = await foldTier(state, [...tier].reverse(), recordArgServices(fresh().args).args);
            if (!matches(forward, reverse, config.match)) {
              throw new Error(`systems ${tier.join(", ")} share a tier but don't commute; declare before/after`);
            }
          }
          state = forward;
        }
        const store = config.makeDb({}).store;
        expectAfter(state, before, testCase.after ?? {}, store, config.match);
        expectEffects(calls, testCase.effects);
      });

      it(`${named.name} (one ECS frame)`, async () => {
        const testCase = fresh();
        const { db, before, input, calls, resolve } = seed(testCase);
        writeArgs(db, resolveArgs(input, undefined, resolve) as Record<string, unknown>, config.args);
        for (const tier of db.system.order) {
          await Promise.all(
            tier
              .filter((name) => name !== SCHEDULER && !unmodelled.has(name))
              .map((name) => db.system.functions[name]?.()),
          );
        }
        expectCase(db, before, testCase, calls);
      });
    });
  });
}
