// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Observe } from "../../../observe/index.js";
import { equals } from "../../../equals.js";
import { StringKeyof } from "../../../types/types.js";
import { RequiredComponents } from "../../required-components.js";
import { Components } from "../../store/components.js";
import { EntitySelectOptions } from "../../store/entity-select-options.js";
import { Entity } from "../../entity.js";
import { Database } from "../database.js";

type EntityData<C, Include extends StringKeyof<C>> =
  RequiredComponents & { readonly [K in Include]: C[K] };

const dbCache = new WeakMap<object, Map<string, Observe<any>>>();

const createObserveSelectDeep = <
  C extends Components,
  Include extends StringKeyof<C>,
>(
  db: Database<C, any, any, any, any, any, any, any>,
  include: readonly Include[] | ReadonlySet<Include | "id">,
  options?: EntitySelectOptions<C, Pick<C & RequiredComponents, Include>>
): Observe<readonly EntityData<C, Include>[]> => {
  const includeKeys = [...include] as string[];

  return (notify) => {
    const entityDataMap = new Map<Entity, EntityData<C, Include>>();
    const entityUnobserves = new Map<Entity, () => void>();
    let currentEntities: readonly Entity[] = [];
    let isInitialized = false;
    let isMicrotaskQueued = false;

    const buildResult = (): readonly EntityData<C, Include>[] =>
      currentEntities
        .filter(e => entityDataMap.has(e))
        .map(e => entityDataMap.get(e)!);

    const emit = () => {
      isMicrotaskQueued = false;
      notify(buildResult());
    };

    const scheduleEmit = () => {
      if (!isInitialized) return;
      if (!isMicrotaskQueued) {
        isMicrotaskQueued = true;
        queueMicrotask(emit);
      }
    };

    const pickComponents = (
      entity: Entity,
      values: Record<string, unknown>,
    ): EntityData<C, Include> => {
      const data: Record<string, unknown> = { id: entity };
      for (const key of includeKeys) {
        data[key] = values[key];
      }
      return data as EntityData<C, Include>;
    };

    const observeEntity = (entity: Entity) => {
      const unobserve = db.observe.entity(entity)((values) => {
        if (!values) return;
        const newData = pickComponents(entity, values as Record<string, unknown>);
        const oldData = entityDataMap.get(entity);
        if (!oldData || !equals(oldData, newData)) {
          entityDataMap.set(entity, newData);
          scheduleEmit();
        }
      });
      entityUnobserves.set(entity, unobserve);
    };

    const unobserveEntity = (entity: Entity) => {
      entityUnobserves.get(entity)?.();
      entityUnobserves.delete(entity);
      entityDataMap.delete(entity);
    };

    // observe.select fires synchronously on subscribe, populating
    // currentEntities and entityDataMap via per-entity observers.
    const unobserveSelect = db.observe.select(
      include as any,
      options as any,
    )((entities) => {
      const newSet = new Set(entities);
      const oldSet = new Set(currentEntities);

      for (const entity of oldSet) {
        if (!newSet.has(entity)) unobserveEntity(entity);
      }
      for (const entity of entities) {
        if (!entityUnobserves.has(entity)) observeEntity(entity);
      }

      currentEntities = entities;
      scheduleEmit();
    });

    // Synchronous initial emission (entity data already populated above)
    isInitialized = true;
    notify(buildResult());

    return () => {
      unobserveSelect();
      for (const unobserve of entityUnobserves.values()) unobserve();
      entityUnobserves.clear();
      entityDataMap.clear();
    };
  };
};

/**
 * Deeply observe entity data for an archetype query.
 *
 * Unlike `db.observe.select` (which returns entity IDs and only triggers on
 * set membership changes), `observeSelectDeep` returns full typed entity data
 * and re-emits whenever ANY included component value changes on any matched entity.
 *
 * Composes `observe.select` for set membership with per-entity observers for
 * value changes. Per-entity deduplication avoids re-emissions when unrelated
 * components change on a tracked entity.
 *
 * Equivalent parameters return the same cached `Observe` factory, and
 * `Observe.withCache` shares a single underlying subscription across all
 * simultaneous subscribers.
 */
export const observeSelectDeep = <
  C extends Components,
  Include extends StringKeyof<C>,
>(
  db: Database<C, any, any, any, any, any, any, any>,
  include: readonly Include[] | ReadonlySet<Include | "id">,
  options?: EntitySelectOptions<C, Pick<C & RequiredComponents, Include>>
): Observe<readonly EntityData<C, Include>[]> => {
  let cache = dbCache.get(db);
  if (!cache) {
    cache = new Map();
    dbCache.set(db, cache);
  }

  const key = JSON.stringify({ include: [...include].sort(), options });
  let observe = cache.get(key);
  if (!observe) {
    observe = Observe.withCache(createObserveSelectDeep(db, include, options));
    cache.set(key, observe);
  }
  return observe as Observe<readonly EntityData<C, Include>[]>;
};
