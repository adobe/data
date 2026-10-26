# Lookups

A *lookup* reads another entity from a system. It's named in the declaration, `lookup: { enemy: { with, not } }`, and
called from the body, `lookup.enemy(entity)`. It's read-only, and it doesn't change which entities the system runs on.

- [The call](12-lookups.ts#L18-L24) gives the entity's row, or `null` when the entity lacks a component in `with` or
  has one in `not`. So the tracker of the frozen statue aims at 0.
- The row holds only what `with` lists.
- With `changed: [health]`, the row's `changed` says whether those components may have changed since the system last
  ran: [`watch`](12-lookups.ts#L26-L34) sees `true` on its first run and `false` on the next.

A system can't look up components it writes, since a lookup reads other rows while the run writes them.

To find entities by value rather than by id, look up through an [index](13-indexes.md).
