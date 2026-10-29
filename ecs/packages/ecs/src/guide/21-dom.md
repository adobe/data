# Animating elements

Systems can drive the page: the world holds what it shows, and systems write it to elements after each tick. Both UI
chapters animate particles bouncing inside `#output`, the element the guide's Output tab gives, which a resource
holds. Without a page, as in node, a stand-in takes its place, so the systems run the same and the program prints the
same.

- Objects live on the thread that shows them: [the dot and the stage](21-dom.ts#L22-L27) are `thread: "main"`, so the
  systems touching them run on the page's thread.
- A fixed `cadence` of 60 ticks a second, with `always`, makes [a velocity per tick a speed](21-dom.ts#L107),
  whatever the display's rate.

Each tick runs one composite:

1. [`move`](21-dom.ts#L38-L44) moves every particle and turns it back from the walls.
2. [`create`](21-dom.ts#L46-L51) gives each particle without a dot an element, with `commands.add`. Readonly systems can't
   issue commands, so it ticks, and its condition `is: [stage]` waits for a stage.
3. [`draw`](21-dom.ts#L52-L60), a readonly system, sets each moved dot's `style.translate`, a transform, which the page
   doesn't lay out again. `changed: [position]` skips the dots that didn't move.

[A finalizer](21-dom.ts#L61-L63) removes a particle's element when the particle goes, and every element when the
world is disposed, so one fewer dot is left once the traced particle is despawned.
