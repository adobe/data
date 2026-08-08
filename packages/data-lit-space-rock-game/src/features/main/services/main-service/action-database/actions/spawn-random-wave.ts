// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../../service-database/service-database.js";

// The app-facing realization of `State.spawnRandomWave` (which injects the same
// `random` port): read the `random` service from `db.services` and commit the next
// wave through the single `spawnRandomWave` transaction (which reads the current
// field/wave/bounds from the store — never a cached computed — and is a no-op
// while asteroids remain). `random.next()` is a value-returning read, not a
// fire-and-forget effect, so it is not surfaced to the caller.
export const spawnRandomWave = (db: ServiceDatabase) => {
  db.transactions.spawnRandomWave({ random: db.services.random });
};
