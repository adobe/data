# @adobe/ecs-persistence

Saving, loading and copying the entities of `@adobe/ecs` worlds, by traits the application declares for the places it
saves to. A snapshot holds whole archetypes' columns: a struct's or a number's bytes as the world stores them, which
saving and loading copy as blocks, and the values of strings and other data. Its entity values are rewritten as
they're loaded, so references between the entities it holds still name each other.

## Saving by a trait of your own

Each place an application saves to is a trait of its own: a `Symbol()` declared in `Traits`, whose value on a
component's or resource's declaration is the stable name the key is saved under there, whatever its module's path or
version. A document and the user's settings, say:

```ts
import type { Entity, Vec3 } from "@adobe/ecs";

export const file = Symbol();      // saved in a document's file, under this name
export const settings = Symbol();  // saved in the user's own settings, under this name
export const position = Symbol();
export const parent = Symbol();
export const tool = Symbol();
declare module "@adobe/ecs" {
    interface Traits<N> { readonly [file]: string; readonly [settings]: string }
    interface Components {
        [position]: { type: Vec3; [file]: "position" };
        [parent]: { type: Entity; reference: "owner"; [file]: "parent" };
    }
    interface Resources {
        [tool]: { type: string; default: "select"; [settings]: "tool" };
    }
}
```

A trait covers each key whose declaration gives it a string. A name only has to be unique among the keys one trait
covers, and a key may carry several traits, under the same or different names, and is saved in each place. Only data
is saved: a value with a schema. A derived component isn't, as `Component.derive` derives it again once its entity is
loaded; a trait covering one fails as data.

## Saving and loading

```ts
import { decode, encode, snapshot, spawn } from "@adobe/ecs-persistence";

const taken = await snapshot({ world, by: file });
if (taken.failure !== undefined) throw new Error(taken.failure);
const bytes = encode(taken);

const loaded = decode(bytes, { by: file });
if (loaded.failure !== undefined) throw new Error(loaded.failure);
const spawned = await spawn({ world: other, snapshot: loaded });
```

- `snapshot({ world, by, ... })` takes, of each entity it takes, the components the trait `by` covers: every entity
  holding one of them, those matching `with`, `not` and `where`, or `root` and everything it owns through owner
  references the trait covers. Except with `root` or `resources: false`, it takes the resources the trait covers too.
  A snapshot holds the trait it was taken or read by.
- **Chunks:** `where` takes values of shared components, as a system's `where` of values does:
  `snapshot({ world, by: file, where: { [chunk]: [4, 0] } })` reads the archetypes holding them whole and no others, so
  one chunk's snapshot costs what it holds, not the world. `spawn` puts each entity back into the archetype of its
  shared values.
- `encode` writes it as bytes, and `decode(bytes, { by })` reads them back by the trait `by`, viewing each column's
  bytes where they are in the buffer. It refuses bytes naming a component or resource the trait doesn't cover, or
  covers with another schema, so a document's bytes can't be loaded as settings, nor the reverse.
- `spawn({ world, snapshot, entities? })` spawns an entity for each of the snapshot's and sets its resources, its entity values
  naming the entities spawned for theirs. An entity value naming an entity outside the snapshot follows what
  despawning that entity would do: an entity it owns isn't spawned, nor what that owns, and the result counts them in
  `dropped`; a weak reference to it is left out; any other value naming it is `Entity.none`. The result's `entities`
  maps each of the snapshot's entities to the one spawned for it, or null; `entities: false` leaves the map out, which
  saves about 85 ms and 50 MB at a million entities.
- Copying entities from one world into another is a snapshot spawned there:
  `spawn({ world: to, snapshot: await snapshot({ world: from, by: file }) })`, without bytes.
- **Merging:** `match` takes unique indexes saying which of the snapshot's entities are already in the world:
  `spawn({ world, snapshot, match: [materialByName] })`. An entity an index holds in the world, with the key of one
  of the snapshot's it holds, stands for that one, keeping its own values, and every entity value naming the
  snapshot's names it; `entities` maps the one to the other. Keys compare as stored, a number's or a vector's bytes and
  a string's or an object's value. It fails for an index whose key, `with` or `not` names a component the snapshot's
  trait doesn't cover, or two of the snapshot's entities one index holds with one key.
- **Updating:** with `update: true`, each entity `match` found takes the snapshot's components of its own, as
  `commands.add` gives them: added where it lacks one, replaced and marked changed where it has it, its other
  components left as they are. So an entity the application makes at startup, such as a camera, keeps a component that
  is a saved setting: `spawn({ world, snapshot: settings, match: [byCamera], update: true })`.

Each reports why it didn't happen as `{ failure }`, rather than throwing, and `result.failure !== undefined` tells
which. A snapshot is opaque: only these functions read it.

## Speed

`pnpm test:perf` compares, at 100K and 1M entities with a `Vec3`, a number, an owner reference and a struct holding an
entity, this package with reading rows and spawning entity by entity. At 1M entities, a snapshot takes about 6 ms
against 110 ms, encoding 5 ms against 150 ms for `JSON.stringify` of the rows, and decoding views the bytes where they
are. Spawning takes about 165 ms against 1,450 ms. Matching reads the world's entities each index holds, so its cost
grows with those: a merge of 1M entities, each matched by a unique index on its `Vec3`, takes about 440 ms. One
chunk of 10K among 1M entities, told apart by a shared component, snapshots in about 0.13 ms by `where`, against 6 ms
for the whole world and 55 ms for its root's subtree, and spawns in about 2 ms.
