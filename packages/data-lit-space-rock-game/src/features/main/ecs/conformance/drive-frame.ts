// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { SystemDatabase } from "../system-database/system-database.js";

// Drive exactly one frame headlessly — no rAF, no rendering — the way the
// scheduler would: every system in dependency order (`db.system.order`),
// skipping the scheduler's own bookkeeping system. This is the documented
// headless-host pattern (see systems.md), used by the tick-loop conformance
// test and the collision-detection tests. Test-only.
export const driveFrame = (db: SystemDatabase): void => {
  for (const tier of db.system.order) {
    for (const name of tier) {
      if (name === "schedulerSystem") continue;
      // `name` comes from `db.system.order`, so it is always one of this
      // database's declared system keys — an invariant the `string` element
      // type of `order` cannot carry.
      const fn = db.system.functions[name as keyof SystemDatabase["system"]["functions"]];
      if (typeof fn === "function") fn();
    }
  }
};
