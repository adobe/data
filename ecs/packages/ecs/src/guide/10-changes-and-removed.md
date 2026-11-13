# Changes and removed systems

A *removed system* runs for each entity that stops matching it, whatever the cause: a despawn, a removed component, an
owner's despawn or the world's disposal. It reads the entity's values from before, so it can release what they name
outside the world, such as GPU buffers and DOM nodes. [This one](10-changes-and-removed.ts#L17-L19), made by
`System.removed`, closes handles: the despawned entity's and the one whose `handle` was removed.

A *changes system*, made by `System.changes`, sees each sync point's structural changes to the components it watches,
grouped by how entities changed. [`changes.previous` and `changes.next`](10-changes-and-removed.ts#L39-L44) give a
component's value before and after, `null` where the entity didn't have it: what saving and undo need. It watches what
`watch` names: components, resources, whose writes it sees as `changes.resources`, and traits of your own, every
component and resource declaring one, as each registers, so a list kept by hand never misses a key. Without `watch`,
every component and no resource; `watch: { components: true, resources: [...] }` watches every component and the
resources listed.

Values written to rows aren't structural changes, but a changes system learns that they were written:
[`changes.written`](10-changes-and-removed.ts#L43) lists the watched components some system, or kernel, assigned
through a row since the last sync point changes systems ran at, such as `size` after [`grow`](10-changes-and-removed.ts#L32-L34),
and not which entities or values, so a consumer that saves a snapshot knows to save again without reading every row. A
run whose only news is such a write still has a sync point, where they see it. Following them keeps change ticks for
the watched components, so a row assigned costs a little more, a kernel's next to nothing, and nothing while no changes
system watches them.

Both run inside sync points, before they apply, and only in a world they're added to, [`world.add(handles)`](10-changes-and-removed.ts#L50),
from its next sync point on, in runs and ticks alike; adding them doesn't make it tick. `run` doesn't take them, nor a
composite holding one. Pair a release with what creates what it releases in [one composite](10-changes-and-removed.ts#L46),
so adding one adds both. `before` and `after` order them only with each other; otherwise they run in the order added.

Removing a removed system runs it for every entity it still matches, and `world.dispose()` runs every one added, so
[the last handle](10-changes-and-removed.ts#L59-L60) closes too.
