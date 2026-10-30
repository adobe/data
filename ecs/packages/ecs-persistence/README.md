# @adobe/ecs-persistence

Saving, loading and copying the entities of `@adobe/ecs` worlds. A snapshot holds whole archetypes' columns: a struct's
or a number's bytes as the world stores them, which saving and loading copy as blocks, and the values of strings and
other data. Its entity values are rewritten as they're loaded, so references between the entities it holds still name
each other.

## Marking what persists

A component or resource persists when its declaration names it with the `persist` trait, by a stable name: saved data
names it so, whatever its module's path or version.

```ts
import type { Entity, Vec3 } from "@adobe/ecs";
import { persist } from "@adobe/ecs-persistence";

export const position = Symbol();
export const parent = Symbol();
export const score = Symbol();
declare module "@adobe/ecs" {
    interface Components {
        [position]: { type: Vec3; [persist]: "position" };
        [parent]: { type: Entity; reference: "owner"; [persist]: "parent" };
    }
    interface Resources {
        [score]: { type: number; default: 0; [persist]: "score" };
    }
}
```

Only data persists: a value with a schema. A derived component doesn't: its rule derives it again once its entity is
loaded.

## Saving and loading

```ts
import { decode, encode, snapshot, spawn } from "@adobe/ecs-persistence";

const taken = await snapshot({ world });
if (taken.failure !== undefined) throw new Error(taken.failure);
const bytes = encode(taken);

const loaded = decode(bytes);
if (loaded.failure !== undefined) throw new Error(loaded.failure);
const spawned = await spawn({ world: other, snapshot: loaded });
```

- `snapshot({ world, ... })` takes every entity holding a persisted component, those matching `with` and `not`, or
  `root` and everything it owns through persisted owner references. Except with `root` or `resources: false`, it
  takes the persisted resources too.
- `encode` writes it as bytes, and `decode` reads them back, viewing each column's bytes where they are in the buffer.
  It refuses bytes naming a component or resource this program doesn't persist, or persists with another schema.
- `spawn({ world, snapshot, entities? })` spawns an entity for each of the snapshot's and sets its resources, its entity values
  naming the entities spawned for theirs. An entity value naming an entity outside the snapshot follows what
  despawning that entity would do: an entity it owns isn't spawned, nor what that owns, and the result counts them in
  `dropped`; a weak reference to it is left out; any other value naming it is `Entity.none`. The result's `entities`
  maps each of the snapshot's entities to the one spawned for it, or null; `entities: false` leaves the map out, which
  saves about 85 ms and 50 MB at a million entities.
- Copying entities from one world into another is a snapshot spawned there:
  `spawn({ world: to, snapshot: await snapshot({ world: from }) })`, without bytes.
- **Merging:** `match` takes unique indexes saying which of the snapshot's entities are already in the world:
  `spawn({ world, snapshot, match: [materialByName] })`. An entity an index holds in the world, with the key of one
  of the snapshot's it holds, stands for that one, keeping its own values, and every entity value naming the
  snapshot's names it; `entities` maps the one to the other. Keys compare as stored, a number's or a vector's bytes and
  a string's or an object's value. It fails for an index with a part of its key that isn't persisted, or two of the
  snapshot's entities one index holds with one key.

Each reports why it didn't happen as `{ failure }`, rather than throwing, and `result.failure !== undefined` tells
which. A snapshot is opaque: only these functions read it.

## Speed

`pnpm test:perf` compares, at 100K and 1M entities with a `Vec3`, a number, an owner reference and a struct holding an
entity, this package with reading rows and spawning entity by entity. At 1M entities, a snapshot takes about 6 ms
against 110 ms, encoding 5 ms against 150 ms for `JSON.stringify` of the rows, and decoding views the bytes where they
are. Spawning takes about 310 ms against 1,450 ms, most of it the world's bookkeeping of owner references at its sync
point; without references, 1M entities spawn in about 26 ms. Matching reads the world's entities each index holds, so its cost grows with those: a
merge of 1M entities, each matched by a unique index on its `Vec3`, takes about 940 ms.
