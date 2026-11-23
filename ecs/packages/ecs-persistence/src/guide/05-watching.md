# Saving as it changes

An editor keeps its work across reloads by saving a `session` as it changes, rather than on a timer. Some of what the
session covers lives on the page's thread: [`filter`](05-watching.ts#L22) is data the page's views read beside their
elements, so it's declared `thread: "page"`. The world here is on another thread than the page, joined to it as a
worker's world and its page are.

- **Knowing when to save:** [`watch({ world, by: session }, onChange)`](05-watching.ts#L46) calls `onChange` after each
  sync point at which something the trait covers changed, on whichever thread holds it: written, added, removed,
  spawned or despawned. It calls it after the first sync point too, so the first is saved, and returns the function that stops it. A run changing nothing the session covers, `idle`, calls
  nothing, so nothing is saved. Here `onChange` only marks the session due; the program saves when it chooses, so a
  burst of changes is one save.
- **A value on the page's thread:** [`filterBoxes`](05-watching.ts#L28) writes the filter, and runs on the page's
  thread, which holds it. `watch` sees that write as it sees the world's own.
- **Taking it:** [`snapshot({ world, by: session })`](05-watching.ts#L52) asks the page's thread for the filter and
  merges it with what the world holds. Each thread gives its values as of its own latest sync point.
- **Putting it back:** [`spawn`](05-watching.ts#L72) sets the filter on the page's thread again, where the page reads
  it.
