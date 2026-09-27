// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../../service-database/service-database.js";

// The app-facing realization of `State.spawnRandomWave` (which injects the same
// `random` port): read the `random` service from `db.services` and commit the next
// wave through the `refillWave` transaction (which reads the current field/wave/bounds
// from the store — never a cached computed — and is a no-op while asteroids remain).
// The action keeps the transition's name so `checkFeature` pairs it here (the seam
// where the injected `random` double is supplied); the transaction is the
// system-dispatched `refillWave`. `random.next()` is a value-returning read, not a
// fire-and-forget effect, so it is not surfaced to the caller.
export const spawnRandomWave = (db: ServiceDatabase) => {
  db.transactions.refillWave({ random: db.services.random });
};
