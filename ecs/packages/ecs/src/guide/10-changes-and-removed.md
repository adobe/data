# Changes and removed systems

A *removed system* runs for each entity that stops matching it, whatever the cause: a despawn, a removed component, an
owner's despawn or the world's disposal. It reads the entity's values from before, so it can release what they name
outside the world, such as GPU buffers and DOM nodes. [This one](10-changes-and-removed.ts#L15-L17), made by
`System.removed`, closes handles: the despawned entity's and the one whose `handle` was removed.

A *changes system*, made by `System.changes`, sees each sync point's structural changes to the components it watches,
grouped by how entities changed. [`changes.previous` and `changes.next`](10-changes-and-removed.ts#L32-L36) give a
component's value before and after, `null` where the entity didn't have it: what saving and undo need. It watches what
`watch` names: components, resources, whose writes it sees as `changes.resources`, and traits of your own, every
component and resource declaring one, as each registers, so a list kept by hand never misses a key. Without `watch`,
every component and no resource; `watch: { components: true, resources: [...] }` watches every component and the
resources listed.

Both run inside sync points, before they apply, and only in a world they're added to, [`world.add(handles)`](10-changes-and-removed.ts#L42),
from its next sync point on, in runs and ticks alike; adding them doesn't make it tick. `run` doesn't take them, nor a
composite holding one. Pair a release with what creates what it releases in [one composite](10-changes-and-removed.ts#L38),
so adding one adds both. `before` and `after` order them only with each other; otherwise they run in the order added.

Removing a removed system runs it for every entity it still matches, and `world.dispose()` runs every one added, so
[the last handle](10-changes-and-removed.ts#L49-L50) closes too.
