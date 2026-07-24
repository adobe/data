---
---

# Data modelling — locality of knowledge

A type's identity (its members) is named only inside its own folder.
Every other module either accepts members as parameters, narrows broader
input with the type's `is` guard, or iterates `Type.values`.

This applies to any closed set: enums, role tags, status codes,
discriminated unions.

## Example

```ts
// types/http-method/schema.ts
export const schema = { type: "string", enum: ["GET", "POST", "PUT", "DELETE"] }
    as const satisfies Schema;

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
