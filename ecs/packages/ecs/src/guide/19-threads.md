# Threads

A *logical thread* is where objects live and the code touching them runs: the page's `"main"`, or one you declare in
[`interface Threads`](19-threads.ts#L7-L17). `thread: "audio"` places a component or resource on it.

- A system runs on the thread its objects live on: [`mix`](19-threads.ts#L19-L22) writes `levels`, so it runs on
  `audio`.
- A run reading objects on another thread runs there, and resolves to a copy of what it returns.

**Joining.** A world shares itself over a message port, `world.share(port)`, and another thread joins it with
`World.join(port, { threads: ["audio"] })`, claiming the threads it fills. Usually the other end of the channel goes
to a worker; [here both ends](19-threads.ts#L44-L54) are on one thread.

- `share` resolves once the thread joined, with the readonly systems it added as `join` resolved, before awaiting
  anything else. Those readonly systems run there after the world's sync points: `listen` hears what `mix` wrote.
- A joined thread adds only [readonly systems](03-systems.md), which run on it; a system that writes is added on the
  world's thread.
- A joined world runs systems as the world does: [`audio.run`](19-threads.ts#L60-L61) spawns and mixes too.
