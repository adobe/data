---
paths:
  - '**/data/*.ts'
---

# Data modelling — locality of knowledge

A type's identity (its members) is named only inside its own folder.
Every other module either accepts members as parameters, narrows broader
input with the type's `is` guard, or iterates `Type.values`.

This applies to any closed set: enums, role tags, status codes,
discriminated unions.

## Example

```ts
// types/http-method/http-method.ts — the hand-authored type owns the member identity
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";
// (a schema.ts, if/when a runtime boundary needs one, is written to match this
//  type and pinned to it — see global/namespace.md and features/data/index.md)

// In an unrelated request-counter plugin:

// ❌ Members spelled outside the type folder
const counts = { GET: 0, POST: 0, PUT: 0, DELETE: 0 };
function record(m: string) {
    if (m === "GET" || m === "POST" || m === "PUT" || m === "DELETE") counts[m]++;
}

// ✅ HttpMethod owns its identity; this file owns the counter
const counts: Partial<Record<HttpMethod, number>> = {};
function record(m: unknown) {
    if (!HttpMethod.is(m)) return;
    counts[m] = (counts[m] ?? 0) + 1;
}
```

## Collection ordering is carried by the type

A collection's type states whether its order is meaningful — the model is the
single source of truth, not a downstream comparison flag:

- **`ReadonlyArray<T>`** — order is meaningful. A display list of scalar values, a
  positional tuple (`Vec2 = readonly [number, number]`), or an **ordered query
  result of entity ids** (`ReadonlyArray<number>`, sorted by an `order` component —
  see below). Not for the entity *store* itself.
- **`ReadonlySet<T>`** — an unordered bag / membership set. A set of entity
  references is `ReadonlySet<number>` (a set of ids), and an unordered entity
  *query result* is `ReadonlySet<number>`.
- **`ReadonlyMap<K, V>`** — a keyed lookup. This is how **identity-keyed entities**
  are modelled: `entities: ReadonlyMap<number, EntityValue>` — the `number` id is the
  key, and the value carries **no `id` of its own** (identity is the key, never a
  field). Also used for deterministic-key lookups (an enum, a name, a stable string).

**Entities are keyed, never id-bearing values.** An entity's identity is its map
key, so entity value types (`Todo`, `Bullet`) have no `id` field, and there is no
`ReadonlySet<T>`/`ReadonlyArray<T>` *of entity values* — the single
`ReadonlyMap<number, …>` store is the only home for entities, and queries return
their **ids** (`ReadonlySet<number>` unordered, `ReadonlyArray<number>` ordered).
See `features/data/state.md` for the full `State` shape.

These are first-class `Data` (see `features/data/index.md`) — serialize a
Set/Map-bearing value with `Data.stringify` / `Data.parse` (plain `JSON.stringify`
cannot represent them), and `equals` compares them faithfully. Conformance mirrors
the semantics: `ReadonlyArray` compares positionally, `ReadonlySet` / `ReadonlyMap`
order-independently. Entity identity is the map key (resolved to the allocated ECS
entity during conformance); the id is never a value field, so there is nothing to
"ignore" when comparing entity content.

## Shape of keyed collections

- `Record<EnumKey, T>` — every key required at all times. Default lists
  every member. Use only when state is genuinely dense.
- `Partial<Record<EnumKey, T>>` — keys appear and disappear over the
  lifecycle. Default `{}`. Use for sparse / per-actor state.

If the value can be meaningfully absent for a present member (a peer
exists but hasn't moved yet, an entry hasn't loaded), use `Partial`.
Reserve `Record` for descriptors where every member must have a value.

Sibling fields (`{ countGET, countPOST, countPUT, countDELETE }`) duplicate
the type's identity into field names — always replace with a keyed
collection.

## Per-member variation lives with the type

When something *genuinely differs* per member (colours, labels, icons),
the descriptor lives in the type's folder as a `Record<EnumKey, V>`,
named for its purpose:

```ts
// types/http-method/method-color.ts
export const methodColor: Record<HttpMethod, string> = {
    GET: "#06f", POST: "#0a0", PUT: "#fa0", DELETE: "#f00",
};
```

A per-member string built at the call site (`"req-${method.toLowerCase()}"`,
`<HttpMethod>` BEM modifiers, SVG ids) is the same leak in derivation form:
the *mapping rule* belongs in the type's folder, not at the call site.

A static stylesheet that lists `.row--get { … } .row--post { … } …` is
the same leak in CSS form. Drive per-member visuals from the descriptor
(inline `style`, a CSS custom property, or a generated stylesheet) so
the enum is not re-encoded at the rendering layer.
