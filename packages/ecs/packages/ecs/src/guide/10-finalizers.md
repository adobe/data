# Finalizers and change sets

A *finalizer* runs for each entity that stops matching it, whatever the cause: a despawn, a removed component, an
owner's despawn or the world's disposal. It reads the entity's values from before, so it can release what they name
outside the world, such as GPU buffers and DOM nodes. [This one](10-finalizers.ts#L15-L17) closes handles: the
despawned entity's and the one whose `handle` was removed.

`world.dispose()` runs every finalizer for the entities it still matches, so [the last handle](10-finalizers.ts#L46-L47)
closes too.

A *change set* is each sync point's structural changes to the components a `Finalizer.changes` watches, grouped by how
entities changed. [`changes.previous` and `changes.next`](10-finalizers.ts#L32-L36) give a component's value before
and after, `null` where the entity didn't have it: what saving and undo need.
