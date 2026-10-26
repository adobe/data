# Indexes

An *index* maps component values to the entities holding them, and every world keeps it current. `Index.create`
declares it with a `key` and the components an entity needs to be in it; a lookup through it,
`lookup: { at: { index: grid } }`, finds entities by value.

- **Hash**, the default: [`lookup.at(key)`](13-indexes.ts#L20-L25) gives the rows with that key, in entity order.
- **`sorted: true`**: also takes ranges, such as [`{ ">=": 90 }`](13-indexes.ts#L27-L34), and `order: byScore` runs a
  system's rows [in the key's order](13-indexes.ts#L36-L38).
- **`unique: true`**: [one row, or `null`](13-indexes.ts#L40-L42).
- **`key: []`**: every entity with its components, in entity order.

A lookup gives a list: its `length`, `at(i)`, and `changed`, whether an entity entered, left or moved in it since the
system last ran. The list is reused, valid until its call site runs again, and costs only what the body reads. Its rows
hold the index's key and `with`.

With `changed: true` on the lookup, a system runs only when an entity entered or left the index anywhere. Added,
[`countPlayers`](13-indexes.ts#L44-L47) logs once as the players arrive.

A system can't look up through an index keyed by what it writes, nor order its rows by an index that isn't sorted or
is keyed by what it writes.
