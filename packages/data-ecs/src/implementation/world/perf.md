# Performance

Measured on an Apple M1 Max (8 performance cores, 2 efficiency cores). Node numbers come from `pnpm perf`, a Vite bundle run on plain node; vitest's node transform turns imported bindings into getters and roughly doubles JS-heavy costs, so it is not used for comparisons. Browser numbers come from `pnpm test:perf` in chromium with real workers, where timers are quantized to 5 µs; "framed" numbers run once per animation frame and report the median and 90th percentile, which vary up to 2× between sessions. Every number is the fastest run within a time budget.

## Results

Baseline is commit `a28ba8cb`, before the optimization pass.

| Benchmark | Baseline | Now | Gain |
|---|---|---|---|
| create 100K (spawn plus sync point) | 170 ms | 27.6 ms | 6.2× |
| churn 100K (despawn and respawn 10%) | 17.0 ms | 5.05 ms | 3.4× |
| retag 100K (archetype moves for 20%) | 18.0 ms | 7.04 ms | 2.6× |
| emit 100K (commands from a kernel) | 6.65 ms | 0.97 ms | 6.9× |
| sparse changed 1M, uniform 1% | 3.48 ms | 1.15 ms | 3.0× |
| sparse changed 1M, clustered 1% | 3.13 ms | 0.021 ms | ~150× |
| follow 100K (a lookup per row) | 10.6 ms | 0.38 ms | 28× |
| move 1M (250K rows processed) | 0.259 ms | 0.095 ms | 2.7× |
| chain, 6 dependent kernels over 100K | 0.476 ms | 0.343 ms | 1.4× |
| main thread, 50 systems over 1K | 2.89 ms | 1.64 ms | 1.8× |
| select 100K (`where` plus reads) | 18.1 ms | 3.1–4.5 ms | ~5× |

Chromium:

| Benchmark | Main thread | Workers (default pool) |
|---|---|---|
| move 1M | 0.305 → 0.105 ms | 0.105 → 0.020 ms |
| follow 100K | 8.76 → 0.44 ms | 1.02 → 0.075 ms |
| chain 6×100K | 0.67 → 0.405 ms | 0.455 → 0.115 ms |
| sparse changed 1M | 4.78 → 1.095 ms | 0.74 → 0.19–0.25 ms |

At 1M entities, against commit `d6373560` (claimed splits in place):

| Benchmark | Before | Now |
|---|---|---|
| create 1M | 325 ms | 88 ms |
| create flat 1M (ecs2's test: 8 scalars per entity) | | 70 ms; 223 ms with value objects built first |
| churn 1M | 54 ms | 17 ms |
| retag 1M | 79 ms | 42 ms |
| emit 1M | 11.2 ms | 10.6 ms |
| move 1M | 0.177 ms | 0.091 ms |
| chain 6×1M | 3.42 ms | 1.51 ms |
| main thread 50×1K | 1.65 ms | 0.48 ms |
| select 1M | 37.5 ms | 24 ms |
| follow 1M, sparse changed 1M | | unchanged |
| chromium move 1M, main / workers | 0.20 / 0.030 ms | 0.095 / 0.015 ms |
| chromium chain 6×1M, main / workers | 4.47 / 0.725 ms | 1.72 / 0.275 ms |

Moving the code into `src/interface` and `src/implementation`, with ticks added, measured within noise of the record before it (`f9e8d10a`) on every node and chromium benchmark: run idle 333 ns, run 50 idle 109 ns per system, sync point one spawn 1.04 µs, create 1M 91 ms, churn 19.5 ms, retag 35.7 ms, move 1M 0.090 ms, chain 1.54 ms, select 8.27 ms; in chromium, move on workers 0.015 ms and chain on workers 0.29 ms. A run checks the `workers` resource by its changed tick, allocating nothing, and makes the loop due only while systems are added.

Components, resources and traits are keyed by symbols, and the benchmarks moved to symbol keys with them (record `d4256133`, against `4aa829f4` on string keys): every benchmark is within noise but two. `create flat dynamic`, which builds value objects first and spreads them, went 224 → 434 ns per spawn, since V8 lists an object's symbol keys without the enumeration cache `Object.keys` has for strings. `retag` went 35.8 → 33.6 ms, since its literal `commands.add(entity, { [tag]: true })` is now a prepared site; through value objects it measured 43.9 ms. `create`, whose spawns are prepared sites, stayed at 90–94 ms.

**Key reading** (`perftest/keys.ts`, `node dist/perf/run.js --keys`): nanoseconds per values object built and read, for 1 to 6 keys. Listing dominates: reading the same values by keys known in advance costs 58–73 ns, mostly the reads themselves.

| Method | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| `Object.getOwnPropertySymbols` (kept) | 98.7 | 119 | 141 | 168 | 190 | 214 |
| `Object.keys`, then `Object.getOwnPropertySymbols` | 106 | 123 | 145 | 175 | 196 | 217 |
| `Reflect.ownKeys`, symbols only | 104 | 124 | 146 | 171 | 195 | 219 |
| string keys with `Object.keys`, for comparison | 22.8 | 31.6 | 41.0 | 49.3 | 58.3 | 65.2 |

So literal spawns and adds in main-thread systems are prepared sites, which list no keys and build no object; only values objects built at runtime pay for listing.

Archetypes and commands that name their components first (record `bd0dabcc`, against the baseline `4e63c933`, which added a benchmark per kind of structural change): every benchmark is within noise or faster but `spawn bulk kernel` (120 → 131 ns, +9%, every component a kernel's list names now gets a value, its tag's start included) and `spawn singles` (458 → 490 ns, +7%). Faster: `create` 90.6 → 58.1 ns per spawn, `create flat dynamic` 434 → 93.7 ns (beating string keys' 224 ns), `spawn sixteen archetypes` 757 → 57.6 ns, `spawn bulk` 49.8 → 40.7 ns, `despawn bulk` 65.2 → 44.2 ns, `remove tag` 107 → 72.4 ns, `remove several` 152 → 79.2 ns, `add tag kernel` 104 → 85 ns, `add value` 109 → 96 ns; `create flat` 69.8 → 66.8 ns, `add tag` 107 → 100 ns, `add several` 140 → 142 ns, `retag` 35.6 → 33.9 ms. Chromium is unchanged.

- **Spawners are generated per shape:** one read by key and one store per value, so each read sees one object shape. Against a loop over the shape's columns, which is what runs where `'unsafe-eval'` is forbidden: `create` 58 against 126 ns, `create flat` 66 against 127 ns, `create flat dynamic` 94 against 172 ns, `spawn bulk` 41 against 59 ns.
- **Literal spawns and adds stay prepared:** without the plugin's per-site functions, the values object costs about 25 ns for eight keys, so `create flat` measured 86 ns against 66 ns, and `add several` 169 against 142 ns.
- **Archetypes are found by their index:** with only the eight-entry cache, sixteen archetypes from one site resolved their list on every spawn, 523–561 ns; the per-world table by archetype index, and a site's plans by index, take it to 57.6 ns.
- **Moves are grouped by pair of archetypes,** copying shared columns for a block of rows, and rows left are removed last entry first, so an archetype that moves out whole drops its rows without copies; list adds and removes resolve their target once per source archetype.

Sync point fixes for spawns (record `ebde4c9b`, against `bd0dabcc`): `spawn bulk kernel` 131 → 121 ns, back to the baseline's 120, and `spawn singles` 500 → 292 ns, below the baseline's 458; every other node and chromium benchmark within noise (`run idle` reads 333 or 375 ns from one record to the next, as timer steps; `bd0dabcc` measures 375 ns beside this one). Kernels reading lists from other modules changed only what the compiler emits. Each step, measured on its own:

- **A pair whose entries are consecutive needs no ordering pass,** as a system's spawns or moves from one archetype are, and rows are removed only when some entry leaves one: `spawn bulk kernel` 130 → 127 ns. Reading entries through a branch per row instead of an identity order cost `retag` +3%, so the order is still written, in one sequential pass.
- **The plan grows once per buffer,** since each command adds at most one entry, rather than checking capacity at every entry: `spawn bulk kernel` 127 → 120 ns; `retag` 34.5 → 33.5 ms.
- **A spawn batch keeps its archetype,** rather than finding it by its joined ids at every sync point: `spawn singles` 489 → 396 ns.
- **A batch of at most eight rows commits element by element,** since a subarray to copy from costs more than the rows: `spawn singles` 396 → 292 ns.

Kernel spawns staged as main-thread spawns are (record `2b07c576`, against `ebde4c9b`): `spawn bulk kernel` 121 → 10.3 ns, now below `spawn bulk` from a main-thread system, which went 40.4 → 25.4 ns with it; `spawn sixteen archetypes` 56.5 → 41.1 ns. In chromium, the new `spawn bulk kernel main` and `spawn bulk kernel workers`, measured on `ebde4c9b`'s implementation first: 128 → 11 ns on the main thread, 177 → 7.65 ns on workers. Every other node and chromium benchmark is within noise (`create` reads 58–62 ns from one run to the next on either side, and node `sparse changed` 0.32–0.37 ms, as in records since `c234c41a`). Each step, measured on its own:

- **Kernel spawns are staged in batches,** through a spawner per spawn list generated as main-thread spawners are, rather than issued as commands the sync point plans and writes value by value: 120 → 34 ns; in chromium 128 → 18 ns on the main thread and 177 → 54 ns on workers. A main-thread runner's batches and each chunk's buffer naming the rows it staged keep the row order the same whichever thread ran each chunk.
- **The reused indexes a sync point reserved are copied as a typed array,** not an array of numbers: `spawn bulk kernel` 34 → 18 ns, `spawn bulk` 41 → 25 ns, `spawn sixteen archetypes` 58 → 41 ns.
- **Kernel spawners reserve entities in blocks,** so workers spawning together don't contend for one atomic cursor, and the sync point returns the positions a block left unused to the free list: on workers 54 → 7.5 ns, on the main thread 18 → 10.5 ns.
- **Runners stage only when their kernel spawns:** without the check, `run 50 idle` measured 120 against 110–112 ns per system.

The shared layout directory (threads.md, phase 1), against `1a18c6a7`: workers find archetypes and the entity table through records in shared memory, so a sync point that grows archetypes posts no message and leaves workers' windows open. In chromium, `sync point grow 100 archetypes workers` (one spawn into each of 100 full archetypes, then a kernel over them) 1.43 → 0.62–0.68 ms and `spawn bulk kernel workers` 7.7–7.95 → 7.15–7.5 ns; `sync point grow 100 archetypes main`, `loop tick idle` and every node benchmark are within noise.

Command rings for the pool (threads.md, phase 3), against `efedcd21`: worker kernels write their commands into a ring in shared memory as the columns of a `CommandBuffer`, and the world drains a segment by taking views of them, its structs' values staying bytes in the ring, rather than receiving buffers by message. The new `emit workers`, alternating against `efedcd21`'s message path: in node 6.35–6.48 against 6.94–7.03 ms, in chromium 7.76–7.8 against 8.13–8.22 ms. In chromium the run splits into the tiers, 1.15 against 1.9 ms, and the sync point, 6.05 against 5.85 ms: planning reads the columns where workers wrote them, 2.63 against 2.36 ms for freshly deserialized ones, about 3 ns more per command. `emit main` and every must-not-regress benchmark are within noise of `efedcd21` on both.

The adobe/data ECS runs move 1M in 0.09 ms, single threaded with WASM SIMD, and creates 100K in 5.8 ms by inserting directly, with no command buffer or sync point.

Synced systems (P1 of the observers plan), alternating against `af4c72f4`: every node benchmark within noise but `run 50 idle` 110 → 73 ns a system, from three changes to a runner's start that every run takes; `run idle` 416 → 375–416 ns, `loop tick idle` 1.84 → 1.81 µs, `read run` 10.9 → 10.5 µs. New: `run synced` 208 ns against 375–416 for `run idle`, `read run synced` 7.9–9.3 µs against 10.5–11.8 for `read run`, `synced idle 100` 81–85 ns a synced system a tick, about 19 of it the tick's own cost shared over a hundred. Each step, measured on its own:

- **A run's chunks get their length set only when it differs:** writing an array's length is a runtime call even when it's unchanged: `synced idle 100` 122 → 94 ns, `run 50 idle` 112 → 88 ns.
- **Conditions are checked only by a runner that has some:** `synced idle 100` 94 → 86 ns, `run 50 idle` 90 → 80 ns.
- **A run starts on the runner's first buffer and chunk directly,** with nothing staged yet to stage: `synced idle 100` 86 → 78–83 ns, `run 50 idle` 80 → 73 ns.
- **Each list of synced systems keeps its runners,** read again only once runners change, with whether any looks up through an index, rather than finding each runner by its system twice a pass: `synced idle 100` 144 → 122 ns.

Synced systems on joined threads (P3 of the observers plan), alternating against `ffea07de`: every node benchmark touched within noise (`run idle`, `run 50 idle`, `run synced`, `synced idle 100`, `loop tick idle`, `sync point one spawn`, `remote run`, `mailbox resource`, `handoff`, `fused tiers`, `tail prompt`, `read run`, `read run synced`, `loop tick add remove`, `select`, `create`, `follow`), and in chromium `loop tick idle`, `remote run`, `mailbox resource` and `mailbox select 10K`. New: `joined synced resource` 6.4–6.8 µs a tick against 5.0–5.4 for `mailbox resource` in node, 9.3 against 6.6–7.0 in chromium; `joined synced 10K` 0.30 ms against 0.75 for `mailbox select 10K` in node, 0.28 against 0.73 in chromium. Back to back, the world outruns the thread's wake-up, so most posts are cancelled before the thread claims them and the 10K sort runs about one tick in five there; the world's cost is the sync points and writers waiting for posts in progress, and the waited-for post after four cancelled ones.
- **A run of synced systems alone skips its sync point** while nothing is queued and there's no GPU, joined thread or tail: `run synced` 375 → 208 ns, `read run synced` 8.8 → 7.7 µs.

Observer factories against the built-ins, alternating against `799a0e1a`, every other node benchmark touched within noise (`run idle`, `run 50 idle`, `run synced`, `synced idle 100`, `loop tick idle`, `sync point one spawn`, `follow`, `create`, `select`, `remote run`, `mailbox resource`, `joined synced resource`, `read run`, `read run synced`, `observe 1K entities`, `select page 100K`, `count 1M changed`, `loop tick add remove`), and in chromium `loop tick idle`, `mailbox resource`, `remote run` and `observe gpu entity` (both):
- **A synced system added again registers at once with the runner it had,** restarted from tick 0, once the run that removed it is done: `read observe factory cold` 5.8 µs (14.1 at the old 300 rounds) → 0.88 µs, against 0.54–0.58 for `read observe`. What's left is the reader's run with the maintenance system and the notifier in its pass, the notifier's add, and the promise and flush around them.
- **Runs read resources without allocating:** a context binds each resource's storage and the resource entity's row, `changed` filters on resources read stamps by id, and the device check reads its cell directly. With one pass kept for the list of added synced systems rather than one per list (each add or remove makes a new list), a cold read 958 → 833 ns.
- **A scan of one entry with at most one test, every entity or a count, gathers in the scanner's body,** without a call per row through an acceptance and a gather, and each scan's value is made at its length rather than grown: `select factory` 10.2 → 7.5 ms, against 8.0 for `select`. A synced row system testing and writing a typed array alone takes 2.0 ms over the same 1M rows: the gap is the row body's calls.
- `observe 1K entities one changed factory` (29.5 against 25.8 µs) and chromium `observe gpu entity factory` (450–468 against 388–455 µs) are as they were: each entity's lookup by entity is the cost, and entity observers are mainly for debugging.

## Where the gains came from

Step figures marked (vitest) are from the node vitest lane: read them as relative.

**Structural changes.**
- Commands as parallel typed arrays, a reusable typed plan, and cached archetype edges: create 198 → 68 ms, churn 22 → 10 ms, retag 24 → 11.7 ms, emit 7.3 → 3.1 ms (vitest).
- `Object.keys` instead of `for…in`, and buffers reused across runs: small gains.
- Allocation-free kernel commands (`begin`/`value`/`component`/`spawn`): emit 3.2 → 1.98 ms (vitest).
- Inline value writes instead of closures, an 8-shape spawn cache, edges indexed by component id, archetypes grown once per sync point: create 38 → 27.6 ms.

**Change filters.**
- Chunk ticks, the newest tick per 1024 rows, so filters skip unchanged chunks: clustered sparse to ~0.09 ms.
- Filters inside WASM kernels, one call per archetype instead of one per passing range: uniform sparse 3.5 → 1.15 ms, clustered to 0.02 ms.

**Lookups.**
- Precompiled matchers with component ids resolved once: follow 10.4 → 4.8 ms.
- Lookups in WASM through a directory per lookup in shared memory: follow 4.8 → 0.37 ms. Exact entity decoding costs about 0.07 ms, partly recovered by an integer fast path.

**Kernel hot path.**
- Full 16-byte loads for three-lane rows: move 0.262 → 0.204 ms.
- Four rows of whole interleaved elements as full vectors (three for tight vec3) instead of one partial vector per row: move 0.177 → 0.095 ms, chain 6×1M 3.5 → 1.55 ms, chromium main thread move 0.200 → 0.105 ms.
- `changed` stamps only for observed components: move 0.204 → 0.175 ms, chain 0.47 → 0.344 ms.
- Tick columns only for components some system filters on, started at the current tick when the first one registers: create 1M 325 → 296 ms, retag 1M 79 → 68 ms, churn 1M 54 → 50 ms. For the particle fixture, ticks were 80 of 112 bytes per entity.
- Exact integer `%` in WASM instead of a JS import.

**Dispatch.** A task ring per worker in shared memory with `Atomics.notify`, and fast kernels split at half the minimum chunk: chain on workers 0.485 → 0.255 ms, then 0.16 ms with the kernel gains.

**Claimed splits.** Workers claim pieces of a WASM kernel's rows from a shared counter instead of taking even shares, so the slowest core no longer sets the finish time: on the default pool, move 0.055 → 0.030 ms, follow 0.15 → 0.075 ms, chain 0.16 → 0.115 ms, sparse changed 0.30 → ~0.22 ms.

**Affinity claims.** Each worker owns a home range of a split's pieces, the same one every run, takes them from the front, and steals from the back of the fullest other range once its own is empty. Pieces stay on the same worker from one tier to the next 75% of the time instead of 13% (no better than chance), so tier N+1 finds its rows in the cache tier N warmed: chain 6×1M on workers 0.79–0.87 → 0.275 ms, per tier 230 → 170 µs in traced medians; move 1M on workers 0.020 → 0.015 ms. Control words, claim words and status slots each take whole 128-byte cache lines, so a store by one thread doesn't invalidate the line another polls.

**Staged spawns.** A main-thread `commands.spawn` writes its values into a private batch per component set, in the target archetype's layout, and the sync point block-copies each batch into its archetype before the plan, placing entities and stamping ticks with the sync tick. The issuer's tuples are read while fresh and die young, and the plan, shape match and per-component writes at the sync point go away: create 1M 300 → 153 ms, churn 29 → 21 ms. The plugin rewrites each `commands.spawn({ ... })` with literal keys in a main-thread system into a per-site function taking one parameter per value, so no value object is built, nothing is looked up by key, and each value goes through a writer specialized once per shape to its column's layout, called only from that site: create 1M 153 → 88 ms, flat 181 → 70 ms, with no code generated at runtime. adobe/data's ecs2 inserts the flat particles at about 57 ns each, immediately and without deferral, after building each value object. Spawns of objects built beforehand read values by key in a loop, about 3× slower.

**Joined threads.** A wake notifies only a joined thread that has read every earlier one, by a word the thread clears before it reads what's new, so back-to-back ticks don't notify a thread still busy with the last. It seemed to take `mailbox resource` 5.4 → 3.54 µs per tick in node, but a wake landing between the thread's clearing the word and its wait notified no one, and the word then kept later wakes from notifying, so the observer fell behind and stopped being woken (4,412 of some 6,000 values seen). With the thread reading again while the word is set, it sees every value: 5.5 µs a tick, a notify each, against 3.13 µs for the same observer on the world's thread and 2.94 µs for none; chromium 8.7 µs.

**Structure epoch.** Kept only while a joined thread holds claims, turned even by a store and notifying only a reader that waits: `sync point one spawn` 916 → 833–875 ns in node, measured alternating with `c4ecbd8d`, from before phase 4, at 833–875 ns. Two atomic adds and a notify cost about 35 ns a sync point, an add and a store about 24 ns.

**Joined threads' objects.** A rebuild fills each column with its start first and indexes the old rows by entity only for a value the thread gave and kept: `log rebuild 100K` 9.7 → 4.1–4.8 ns a row in node. Their ticks are the world's storages' alone, which the thread's systems stamp, rather than copies the mirror kept beside its columns: `log replay` 24 → 20.6 ns a move and `log rebuild 100K` 4.31 → 3.21 ns a row in node, 5.3 → 3.45 in chromium.

**Systems on joined threads.** A tier, or consecutive tiers, on a joined thread is a task through its task block. The world spins about 20 µs for it before it waits, and the thread that finished one spins as long for the next, each about one wake-up's latency: `handoff` (five tasks a tick) 68 → 11.5 µs a tick and `fused tiers` (one) 19.3 → 7.5 µs in node, 13.2 and 9.4 µs in chromium. Ten tiers fused into one task cost about what one tier's does.

**Finalizers on joined threads.** Stop lists are written a column at a time, the linear structs copied by 32-bit word and each column's storage found once per run of an archetype, and despawned entities' held indexes counted in an array by index: `despawn objects 10K` 176 → 83 ns a despawn in node, against 77 ns with the same finalizer run inline on the world's thread. A `Map` of holds, and a `copyWithin` per stop and struct, cost most of the difference.

**Tails.** A tail's snapshot is laid out for the rows it found passing and copied a run of consecutive rows at a time, its entities and each linear read one `set` each, its positions, archetypes and rows written in place, and tags marked only for a tail that writes objects: `tail late snapshot 10K` 29.8 → 6.7 ns a row in node, from a row at a time through a scratch list, whose tag pass alone cost 3.3 ns a row for a tail that writes nothing. The copy is what lets the world's work after its writer overlap a late tail: `tail overlap` 2.53 ms a tick against 4.70 for `tail overlap waiting` in node (below).

**Indexes.** Node numbers, `pnpm perf`.
- Keeping one current costs nothing while its entities rest: a refresh checks its journal position and its key parts' last writes, which systems' writes and sync points' values mark per component, `index idle` 9 ns an index. Moving 1% of 1M entities to other keys, `index refresh 1M 1%`, 4.3 → 1.56 ms: rows listed with their archetype and row, without marks when one key part's scan is all a refresh reads, short buckets' operations applied as they come and long ones merged once, ordered by a counting sort by bucket; a refresh whose changed chunks' rows pass an eighth counts the rows' own ticks before building again, so a few writes spread over every chunk patch: `rekey 1M`, 1M particles 6% of which cross into another cell a frame, 46.9 → 14.1 ms, against 4.8 ms for the same frame without the index.
- Lookups: a call site's encoding, hash and probe generated for its shape and the index's layout, buckets as records of hash, segment and key beside two-word slots of hash and bucket, and a row bound only when its archetype changed: `unique lookup 1M` 86 → 45–50 ns. A microbenchmark of the same probes over the same table reads 29 ns sequential and 85 random a lookup; an identity hash for integer keys is under "Tried and not kept". `children lookup` 32 ns a child, `grid neighbors 100K main` 10.5 µs a row of 27 probes.
- Sorted ranges: a search over a compact array of each block's last key and entity, comparing words only for keys of words, and `at` walking blocks through a cursor: `sorted range 1M` 1.08 → 0.76 µs a range of ten; `sorted page 100K` 22 µs a change against 1.12 ms for `select page 100K`.
- Kernels: probes in straight-line WASM over the index's arrays, `grid neighbors 100K workers` 179 ns a row across nine workers.
- Building again in phases over fixed pieces and partitions, the listing generated for the key's leaves: `index rebuild 1M main` 37 → 27.3 ms on the world's thread alone, and 6.7 ms across nine workers, the four phases about 1.3, 1.9, 1.3 and 1.8 ms. One worker takes 29 ms, so nine scale it 4.3×: each phase scatters or gathers by partition, and a single-threaded microbenchmark of grouping alone runs at 4.8 ns an entry, branch and memory bound.
- `order run 100K` 31.4 ns a row against 28.3 for the same body in storage order: main-thread bodies walk the index's entries, bound again where the archetype changes, rather than listing rows first (34.5 ns). `order filtered 100K 1%` 180 ns a changed row.
- Lists and their rows of one hidden class: lists defined their accessors as an object literal's, new closures each, so every list after a site's first had dictionary properties, and each pooled row had a map of its own, so a body reading a bucket was megamorphic. Lists and rows now define shared functions in the same order and read their state through `this`; a lookup makes its pool's rows ahead of `at`, the first 256 positions and, for sorted lists, the last 256, so one-time work stays out of what a body inlines and the row getters fit its budget; on the world's thread a row checks one count of replaced arrays, not its archetype's version. `grid neighbors 100K main` 10.6 → 3.66 µs a row, `children lookup` 32 → 13.1 ns a child, `sorted page 100K` 22 → 5.0 µs a change, `sorted range 1M` 760 → 563 ns a range. What's left in `grid neighbors 100K main`, against about 1.6 µs for the kernel on one worker: its 27 probes, 24 of which miss, about 0.7 µs at a half-full table (2.4 slots a probe; a JS microbenchmark of the same probes takes 0.51 µs), and about 6 ns an `at` and 4 a read for each of its 260 neighbors, the loads of the list's state, the pool and the row's slots that TurboFan doesn't hoist out of the loop.
- Refreshes: a refresh lists changed rows once, building again when they pass an eighth, rather than counting their ticks first and scanning again; entries shift an entry a step; whether a key holds objects is kept, not scanned for per entity: `index refresh 1M 1%` 165 → 141 ns a moved entity, `rekey 1M` 14.5 → 12.3 ms. With 100K entities, all in cache, a move still takes 145 ns, so it isn't memory bound: two ordered edits, a binary search and a shift in the old bucket and the new, take 57 ns in a microbenchmark, and finding the key's bucket and the per-entity bookkeeping the rest.
- Indexes without a key, kept as sorted tables with no key words: `keyless refresh 1M 1%`, 1% of 1M entities spread through entity order leaving or entering again, 343 → 187 ns an entity, from padding entries to four words, so a block's shift moves 8-byte words, which a copy within shared memory moves about five times faster than 4-byte ones (a 1.8 KB shift 622 ns by 12 bytes, 128 by 16; a loop is no faster), and binary searches by entity within a block; what's left is a shift of about half a block and a search over 10K fences each way. `keyless spawn 1M 1%`, 1% despawned and spawned again at the end of entity order, 22.4 → 2.1 ms: a split or dropped block refreshed every position, fence, Fenwick node and segment tree, and now those from its position on. `keyless length` 60 → 4.8 ns a lookup reading `length` and `changed`: a site without arguments copies no values, the plugin's count-0 site calls it directly, and a whole index's `changed` reads its tree's root rather than two Fenwick descents. `keyless write 1M`, a refresh after a kernel wrote a component all 1M hold, 3.6 µs, as `keyless index idle`'s 7 ns an index: it reads no key ticks.
- `unique lookup 1M` stays at 44 ns: a build numbers buckets by slot partition, so a lookup in key order reads its slot, record and entry at three unrelated places; a JS microbenchmark of that chain takes 58 ns, and of the slot probe alone 17.8.

**Hot helpers kept small.** TurboFan inlines what a system's body calls into its runner's loop up to a cumulative bytecode budget, so what's left for the row getters depends on everything else the body reaches. `pushCommand`'s growth, a prepared spawn site's plan lookup past the one kept by archetype index, and a list's shape and spawner past the cached ones are outlined: churn 15 → 18 ms in node had come from code elsewhere in the bundle, a dead function placed before `finalizers.ts`'s runner reproducing it on `fe36a99f`, and with `--max-inlined-bytecode-size-cumulative=2000` both measured 14 ms; outlined, churn is 14.9 ms on `fe36a99f` and 15.0 ms here.

**Archetype moves.** Each storage knows its element size in 32-bit words, so a cell copy doesn't dispatch on the layout, and move lists are cached in an array by target archetype id rather than a map: retag 1M 46.5–48.8 → 41.8–44.2 ms.

**Main thread.** Compiled `select` predicates: 18 → ~3.5 ms. `where` tests resolve each archetype's storage once and read plain numbers straight from the view, and tuples of 2–4 adjacent same-typed lanes read as array literals: select 1M 37.5 → 24 ms. Row getters chosen once, and tuple reads and writes in one loop: 50 systems 3.2 → 1.63 ms (vitest).
- Accessor rows each get their own prototype. Built from `{}`, every row after the first that defines an accessor with another getter went to V8 dictionary properties. One row per set of reads and writes, shared across systems and archetypes and rebound per pass, so a body sees one shape; f32-lane tuples read as array literals, and scalars and f32 lanes written directly. Resource cells in a context are resolved once per run. On node: 50 systems 1.1 → 0.45 ms, churn 55 → 32 ms, retag 74 → 59 ms; 50 distinct bodies over three row shapes 1.75 → 0.53 ms; two writing systems over 100K 19.5 → 1.9 ms; 20 systems reading a resource per row 1.26 → 0.22 ms.

## GPU particles

The sample (`pnpm sample`, which opens `/particles/`) draws the visible and enabled quarter of the perf particles as points, wrapping positions in the vertex shader, and moves them with the perf `move` kernel: on the GPU (`?mode=gpu`, positions never come back), on workers with the positions uploaded for drawing each frame (`?mode=cpu`), or not at all (`?mode=static`). Headless chromium on Apple silicon at 60 fps, 10 s per sample after warmup, CPU time per frame by process from `ps`, main-thread task time from the DevTools protocol. Four rounds at 1M (250K drawn), two at 4M (1M drawn):

| Per frame, ms | draw only | CPU move + upload | GPU move |
|---|---|---|---|
| `run`, median (p95), 1M | 0.28 (0.6) | 0.75 (3.9) | 0.39 (0.75) |
| main thread busy, 1M | 0.95 | 1.9 | 1.02 |
| renderer process CPU, main thread and workers, 1M | 2.2 | 4.9 | 2.3 |
| GPU process CPU, 1M | 2.9–3.0 | 2.2 | 3.1 |
| `run`, median (p95), 4M | 0.2–0.45 | 0.97 (1.9) | 0.40–0.46 (0.87) |
| renderer process CPU, 4M | 1.5–2.7 | 5.55 | 2.6 |
| GPU process CPU, 4M | 2.0–3.3 | 4.2 | 3.2–3.3 |

- **The GPU move costs about what drawing alone does:** about 0.1 ms more `run` and 0.1 ms more renderer CPU, the same at 250K and 1M drawn: one record write and one dispatch per archetype.
- **The CPU move costs about 2.7 ms more renderer CPU per frame and twice the main-thread time,** though the move itself is 0.015–0.03 ms on workers. The rest is waking workers inside a frame loop and the 3 MB (12 MB at 4M) upload, copied on the main thread by `writeBuffer` and again in the GPU process, whose CPU rises at 4M.
- **The GPU process uses less CPU in the CPU mode at 1M** than with nothing moving at all; not understood yet.

## Worker scaling

move, chromium, by worker count and entity count (a quarter of the entities move), with even shares:

| Workers | 1M | 4M | 10M |
|---|---|---|---|
| 0 (main thread) | 0.200 ms | 0.785 ms | 1.98 ms |
| 1 | 0.195 ms | 0.785 ms | 1.97 ms |
| 2 | 0.100 ms | 0.410 ms | 1.01 ms |
| 4 | 0.045 ms | 0.215 ms | 0.535 ms |
| 6 | 0.030 ms | | 0.500 ms |
| 7 | 0.025 ms | 0.150 ms | 0.56 ms |
| 8 | 0.060 ms | | 0.555 ms |
| 9 (default) | 0.055 ms | | 0.575 ms |

- **Dispatch overhead is not the limit.** Scaling is linear up to 7 workers at 1M: 0.025 ms is 8× the main thread and 3.6× the adobe/data ECS.
- **Even shares wait for the slowest core.** The default pool is `hardwareConcurrency − 1`, which is 9 here. Past 7 workers, shares land on efficiency cores or share a core with the main thread, so 1M more than doubles. Browsers expose no core types or thread placement, so claimed splits fix this instead: with them, 1M takes 0.030 ms at 7, 8 and the default 9 workers. Pieces per worker (4, 8 or 16) made no measurable difference.
- **At 10M the work is memory bound.** 2.5M rows read 24 bytes and write 12, about 90 MB per run; 0.5 ms is about 180 GB/s, near the chip's CPU bandwidth. It stops improving after 4 to 6 workers, and more entities would not change that.
- **Single-threaded move matches the adobe/data ECS** (0.095 ms against 0.09 ms): four tight vec3 rows are three full vectors, as its separate x, y and z arrays are.

## Tried and not kept

- **Observer factories: a count or selection with `where` tracked through an index without a key,** every row read through `at` and tested after any change: `count 1M changed factory` 23.2 ms against 4.33 for the built-in; a sorted index on the `where` key, each entry looking up its range, takes 42 µs. Kept for selections with a page and no `order`, which stop at the page's end in entity order.
- **Observer factories: descending pages finding each run of equal keys by galloping back from its last row,** three reads of most rows: `select page 100K factory` 23 µs a change; reading each row once, holding a run until its key changes, 16 µs.
- **Observer factories: a scan's result copied out of scratch,** `select factory` 14.3 ms; gathered into the value itself, with the test inline for one entry and entity indexes by `>>> 0`, 10.3 ms, against 8.1 for the built-in's direct column reads. What's left is a row body a row; worth revisiting with a way to read columns in a synced system without a body call per row.
- **Observer factories: keeping a resource's notifier added once idle,** a cold read 2.6 µs (a run of the reader alone) against 14.0 µs adding it again, nearly all of it registering its runner; kept removing it after three idle passes, since each added notifier costs every pass. Adding a synced system again now reuses its runner (0.1 µs of a 0.88 µs cold read), so removing stays.
- **Observer factories: a direct scan's numeric condition tested inline,** its range's bounds compared in the body rather than through the condition's test: `select factory` 8.55 ms against 7.55, the larger body costing more than the call it saves.
- **Observer factories: gathering every entity into a plain array, its value a slice,** 9.5–9.65 ms against 9.1 for typed scratch copied into an array made at its length.
- **A synced system on a joined thread whose unclaimed post a writer cancels rather than copies:** `joined synced resource` 6.0–6.3 µs a tick against 6.2–6.6 copying, within noise; kept copying, since a thread that claims between the writer and the sync point then still runs. Worth revisiting if copying a large read set per tick shows in a profile.
- **Waiting for the post after one cancelled (`cancelsBeforeWaiting` 1), or after sixteen:** at 1 the thread runs at least every other sync point, but the world waits for its wake-up nearly every other tick back to back: `joined synced resource` 11.4–15.8 µs in chromium against 9.3 at 4, `joined synced 10K` 0.50 ms in node against 0.30. At 16, 6.4 µs and 0.11 ms in node, 9.2 µs and 0.12 ms in chromium, the thread up to 17 sync points behind. Without waiting at all, `joined synced 10K` never ran in chromium in 3,000 back-to-back ticks: every post was cancelled first. Kept 4. Worth revisiting with a cadence-aware limit, such as milliseconds behind rather than posts.

- **A loop spawner as the only spawner:** about twice the generated one (numbers above). Kept only where code can't be generated. Worth revisiting if engines specialize a shared loop's keyed reads per shape.
- **Prepared spawn sites calling the shape's column writers:** one site spawning into four archetypes made each writer call see four closures, `create` 103 ns and `create flat` 76 ns, against 58 and 66 ns through a positional spawner generated per site key order and shape.
- **Removing the prepared sites,** as the plan for curried spawns proposed once they no longer won: they still win by the values object's cost (above).
- **A spawn site remembering the last archetype and world it spawned into,** checked before the plans by index: `spawn singles` 390 → 380 ns, within noise, but `create` 58 → 61.5 ns and `create flat` 64 → 70.5 ns. Worth revisiting if a site's plan lookup shows up in a profile again.
- **Removing rows last first without grouping moves by pair:** `add tag` 114 ns and `retag` +10%; grouping the arrivals by pair took them to 100 ns and −5%.
- **Main-thread kernels spawning into the world's batches,** as main-thread systems do, rather than their runner's: `spawn bulk kernel` 17.8–18.6 ns against 17.8–19.3 ns, no gain, and the rows of chunks run on workers would land after every main-thread chunk's, so row order would depend on the worker count.
- **Blocks of reservations whose unused positions the leak scan finds,** rather than returned by position: `spawn bulk kernel` 15.5 against 10.3 ns, and the scan bumps the generations of indexes never handed out, which wears them toward wrapping. Kept for chunks that fail.
- **A first block of 64 positions:** 10.3 ns against 10.4 ns starting at 8; 8 is kept, since a kernel spawning a few entities a run returns fewer.
- **Kernel adds and removes staged as spawns are:** not built. A profile of `add tag kernel` (81.5 ns, below `add tag`'s 96 ns) puts issuing in the kernel at 12% and the sync point at the rest: plan 29%, arrive 19%, sort 12%, writes 7%. Staging would have to bypass the plan, which orders adds against despawns and other commands. Worth revisiting with bulk moves in the plan (design.md).

- **Listing symbol keys with `Reflect.ownKeys`, or with `Object.keys` first:** 1–5% slower than `Object.getOwnPropertySymbols` for 1 to 6 keys (table above), and `Object.keys` finds nothing, since keys are symbols. Worth revisiting if engines give symbol keys an enumeration cache.
- **U32 ticks:** no measurable gain on the non-sparse 1M benchmarks, 10% on uniformly sparse filters, and change filters go wrong past 2³² ticks unless a clamp pass is added. With ticks kept only where observed, it would help only observed components.
- **Commands encoded from WASM:** emit 1M 11.2 → 9.2 ms on the main thread and no gain on workers, for about 800 lines across the compiler, code generation, runner, pool, worker and sync point. The sync point is most of emit's time.
- **Workers spinning 0.15 ms instead of 0.05 ms before waiting:** chain 6×1M on workers 0.83 → 0.525 ms back to back, but only because it bridges the gap between consecutive benchmark runs; per frame it measured the same.
- **Holding workers spinning while a later tier of the run has kernels,** with no time constant: per frame the same, and move's best case on workers 0.020 → 0.040 ms. Traces showed the 0.05 ms spin already keeps workers awake across tiers (each tier is seen within about 5 µs).
- **Home ranges sized by each worker's recent share of pieces:** no gain (chain 0.275 → 0.29 ms). Shares never settle: apart from the slowest few workers, each swings by about 40% between rounds, so the sizing chases noise and moves range boundaries, which costs affinity.
- **Copying numbers and f32 tuples out of command values when issued,** into a typed array the sync point reads, so the issuer's arrays die young: the sync point got 27 ms faster and garbage collection 12 ms, but issuing got 96 ms slower per million spawns (create 1M 294 → ~357 ms). Reading the tuples costs as much at issue time as later, and the extra bookkeeping is more than the sync point saved.
- **Segments of records, a command at a time, decoded into the world's buffers:** the decode cost 0.9–0.98 ms per run of chromium `emit workers` (100K commands), as much again on a second pass over the same bytes, so instruction-bound, not memory-bound, which put `emit workers` at 8.6–8.8 ms against `efedcd21`'s 8.2–8.4 ms; in node 6.83–6.93 ms against 6.94–7.03. Decoding command by command through `pushCommand` and a per-component push, rather than into arrays fitted once per segment, was slower still: node 7.24–7.49 ms. Columns copied in by the worker, which the world takes views of, took it to 7.76–7.8 ms.
- **Copying a segment out of the shared ring before decoding it:** chromium drain 0.98 → 1.49 ms; the decode didn't get faster, and the copy cost 0.5 ms.
- **Inlining the one-word copy of a struct value in `writeRange`, and a views sentinel in place of `null` for buffers without bytes:** no change, sync point 6.1–6.2 ms either way.
- **Copying drained columns into fresh, exactly sized arrays:** planning 2.60 → 2.45 ms in chromium, but the copies cost more than that.
- **The main thread claiming pieces too:** no gain; workers that wake late are slow at first, so the main thread does about what it would alone.
- **A loop per main-thread system** (eval or emitted by the plugin): 5–10% on top of fast-property rows; a micro-benchmark of 50 systems with one loop literal each measured 16%. The tuple each `row[component]` read allocates stays, and it costs more than the shared call site. Worth revisiting with compiled main-thread bodies, where reads become column loads.
- **Removing a sync point's rows after all its entries, each archetype's from the highest,** so every row that stays moves at most once: churn 1M +13%, retag +6%. Sorting, the map of rows and a second pass over scattered rows cost more than the copies saved, and copying cells is only about 12% of retag; planning, the system's body and per-entry work make up the rest. Worth revisiting only with column-major moves per pair of archetypes, where removals are batched too.
- **Unrolled f32 lane writers for staged spawns:** create 1M −5% for 30 more lines. Profiles attribute the caller's tuple allocations to the writer, which inflates it. Worth revisiting if spawns stop allocating tuples.
- **Faster value-object spawns** (`create flat dynamic`): `Object.keys` and the caller's own spreads dominate, on a path the plugin already avoids for literal keys. Worth revisiting only if spawns from data objects matter to real workloads.
- **SIMD reductions:** lanes compute in f32 at storage precision, which would round sums into f64 partials. Four rotating scalar lanes took reduce 1M 0.93 → 0.50 ms instead. Worth revisiting with an f64x2 path in the across-rows mode.
- **Faster WASM lookups** (`follow`): the generated find is already an entity-table check, a directory record and column loads, about 3.8 ns per row of dependent loads. Worth revisiting with a measured breakdown of where those cycles go, such as with lookups batched per archetype.
- **Positional `commands.add` and `commands.remove` for literal keys,** as the plugin does for spawns: not built. Issuing them, with their key lookups, is about 8% of retag 1M; planning and applying the moves are the rest. Worth revisiting once the sync point's own cost per move is much lower.
- **Fixed costs per run, measured rather than tried:** a run of a system no entity matches costs about 0.8 µs, fifty of them 0.39 µs each, and a run whose sync point applies one spawn 1.5 µs. Kernels at 1K and 10K rows stay within 2–5× of their best, as at 1M, so small systems hide no large cost.
- **The world's thread spinning up to 50 µs for a joined thread's next run** before waiting on its posted word: `remote run` 12.4 → 66 µs in node, since the spin holds the world's thread and the run it just started waits behind it.
- **Runs from joined threads, measured rather than tried:** two node threads waking each other through `Atomics.waitAsync` take 9.7 µs a round trip, so `remote run`, 12.4 µs, spends about 2.7 µs beyond the platform's floor; spinning instead would block the joined thread, which is often the window's. A mailbox adds about 20 µs a tick to `mailbox select 10K`, whose 0.75 ms is the ordered selection the world's thread recomputes, as it would for its own observer.
- **Checking commands' values for a joined thread's objects as they're issued,** in `commands.add` and prepared add sites, behind a check of whether any thread holds claims: `add value` 95–97 → 100–104 ns in node, measured alternating, with the sync point's own additions about 2% of it. Checked when a system's commands are queued instead, dropping the command and failing its system, where the issuing paths stay as they were; spawns are checked as they're issued, in the object columns' writers, which only objects reach.
- **The structure epoch turned even by a store, notifying only waiting readers, kept at every sync point:** about 24 ns a sync point against 35 ns, and `sync point one spawn` still a timer step (41 ns) above `c4ecbd8d`; kept only while a joined thread holds claims instead.
- **Replay finding a pair of archetypes' source columns once per run of its moves:** `log replay` 23.7–24 → 24.7 ns a move, no gain; a mirror's archetypes hold few columns. Worth revisiting with many objects per archetype.
- **Emptying a run's list of warnings by setting its length to 0** each run: `run idle` 375 → 416 ns in node, measured alternating; the list is counted instead, and the report of warnings alone reused while they're the same.
- **Moving `placeFinalizer`,** to the end of `finalizers.ts` or into `activate.ts`, its one caller: churn 17.6–18.6 ms either way, since the budget above, not that function, set it.
- **Writers waiting for a tail to finish instead of snapshotting it,** and **choosing between the two by the tail's rate** (rows read over time since posted, waiting when finishing looked cheaper than copying the rest). Ticks of a world writing every row's place, then working W ms, while the last tick's tail on a joined worker spends T ms on 10,000 rows of a place and a pose, after B ms of other work there; ms a tick, snapshot / waiting / by rate, node then chromium (node's frame is a timer set after each tick):

  | Case | node | chromium |
  |---|---|---|
  | frame, typical: T 2.5, W 2 | 20.1 / 20.2 / 20.2 | 16.7 / 16.7 / 16.7 |
  | frame, B 8 + T 2.5 and W 9: together over a frame | 26.5 / 26.8 / 26.9 | 16.7 / 20.7 (p95 25.5) / 16.7 |
  | the same, W before the writer | 26.7 / 26.8 / 26.8 | 16.7 / 16.7 / 16.7 |
  | frame, B 20 + T 2.5, W 3: tail longer than a frame | 23.3 / 26.2 / 22.7 | 22.6 / 26.2 / 22.7 |
  | fixed 16.7 ms, B 8 + T 2.5, W 9 | 16.7 / 20.2 / 16.7 | 16.7 / 20.2 / 16.7 |
  | the same, W before the writer | 16.7 / 16.7 / 16.7 | 16.7 / 16.7 / 16.7 |
  | fixed 4 ms, T 2.5, W 3 | 4.0 / 6.1 / 4.0 | 4.0 / 6.1 / 4.0 |
  | the same, W before the writer | 4.0 / 4.0 / 4.0 | 4.0 / 4.0 / 4.0 |

  A writer arriving as the tail of 2.6 ms had read 0, about half, 85% and 95% of its rows, chromium, its run in ms: snapshot 0.175 / 0.165 / 0.115 / 0.125, waiting 2.72 / 1.56 / 0.42 / 0.23, by rate 0.2 / 0.205 / 0.155 / 0.13; node alike. The snapshot holds the world's thread 20–72 µs a writer for the copy, waiting 22–27 µs for its spin; the joined thread's time is the same either way, but for one body (Next). By rate never chose to wait in any tick case: a row copies in 6–8 ns, less than any tail's work on it, so finishing is cheaper only within about the last chunk, which the writer waits for anyway. Waiting is worth revisiting if a tick could no longer run ahead of its last tail at all, and by rate if copies grew costly against tails' work per row, as with wide struct reads and light bodies.
- **Dropping a component's kernel stamps as soon as nothing watches it,** reloading the kernels that write it then, rather than at their next load for another reason: ticks that alternately add and remove a system filtering on `changed` of what a kernel writes, 100 rows, took 216 µs a tick against 13.9 µs, in node, since each removal and each add reloads the kernel, its import and WASM compile on every thread, while a stamp kept costs a store per chunk. Worth revisiting only if stamps of components nothing watches showed up in a kernel's profile.
- **Checking eight rows' ticks at every row,** rather than at rows aligned to eight: clustered changes 0.023 → 0.108 ms, since each passing row checked a block again. Aligned checks cost clustered changes about 3 µs.

- **Index builds across the pool as messages,** a message to each worker per phase in five phases: `index rebuild 1M workers` 9.5 ms on nine workers; each phase paid about 0.4 ms of round trips (counting, trivial work, took 0.5 ms). Phases go through the workers' task rings as tasks of a reserved kernel number, their plan in the memory, instead.
- **A separate scatter phase,** copying listed entries into partition order: 8.35 ms. Counting computes each piece's partition counts and listing writes straight into partition order: 6.7 ms.
- **A loop over the key's leaves for listing:** 14 ns an entity single-threaded in a microbenchmark, of which the member check costs 2.6 ns, the hash call 2 and the loop over leaves 5. Generated code for the plan's leaves runs about 6 ns; the loop is kept where code can't be generated.
- **Grouping with each slot's hash beside its bucket in thread scratch:** 7.4 ms single-worker either way; kept, since it reads less.
- **Building again whenever changed chunks' rows pass an eighth:** `rekey 1M` 46.9 ms, built every frame, since 6% of rows crossing touch every chunk. Counting the rows' own ticks then: 25.9 ms.
- **Merging a refresh's operations sorted by `Array.prototype.sort` with a comparator:** 25% of `rekey 1M`'s profile. A counting sort by bucket and an insertion sort within each: 14.1 ms.
- **Schedule depths as an `Int32Array`,** after `loop tick add remove` grew 234–241 → 260–272 ms with indexes (85b434cb, measured alternating against 2898bf26 and at each later commit): `createSchedule`'s 223 eager deopts on the depths array's map went to 3, but the benchmark didn't move, and timing its sections shows a schedule costs the same, about 2.9 µs, before and after. A larger inlining budget, and runners not making `order`'s closures, didn't move it either. Timed in the benchmark, `System.create` takes about 1 µs more a tick and `add` 0.9 µs more, and a micro-benchmark of `System.create` alone collects garbage half again as long; not found yet (Next).
- **Ordered bodies listing their rows before running them,** as kernels' runs do: `order run 100K` 34.5 ns a row against 31.4 walking the entries.

- **An index without a key as one hash bucket,** zero key words hashing to one bucket in entity order, which every path already read: `keyless refresh 1M 1%` 6.73 ms against 3.43 for a sorted table then, since a long bucket merges its whole length once any entity enters or leaves, and a spawn per frame into 1M would cost an O(1M) merge. `keyless length` was 5.8 ns, against 4.8 for the sorted table's site once it took no arguments.
- **`copyWithin` for shifts of 3-word entries:** no faster than the loop (`keyless refresh 1M 1%` 3.43 ms either way): a copy within shared memory by 12 bytes moves 4-byte words. Kept only with entries padded to an even number of words (above). Smaller blocks for indexes without a key would halve the shift again, but the 128-entry block is in every reader, WASM included.
- **Index tables at most a quarter full:** `grid neighbors 100K main` 3.93 → 3.73 µs a row, its misses mostly stopping at the first slot, but `unique lookup 1M` 44 → 53 ns, its slots twice as large and less cached. Half full is kept. Worth revisiting for non-unique indexes only, where slots are small next to entries, if misses dominate a real workload.
- **An identity or locality-preserving hash for integer keys:** in a microbenchmark of the slot probe over 1M keys, identity takes dense keys in order from 17.8 to 11.4 ns but scattered keys from 18 to 31 ns, and a miss for a key past a dense range scans the whole run of filled slots, 660 µs; keeping a key's high bits and mixing its low ones packs dense keys into slots side by side, 21 µs a lookup. Linear probing needs the hash to spread keys whatever their distribution; a dense direct table beside the hash would be the way to get the 9 ns, at the cost of keeping a second structure and teaching kernels to read it.
- **Reading a patch's keys, hashes and buckets ahead in batches of 64,** so their misses overlap: `index refresh 1M 1%` 165 → 173 ns and `rekey 1M` 14.7 → 23.7 ms. A move in cache costs the same, so there was little latency to hide.
- **A list's pool in three banks, its first, last and middle positions,** for hash lists too: `grid neighbors 100K main` 3.63 → 3.84 µs a row from choosing the bank in `at`. Only sorted lists keep a second pool for their last positions.
- **Making a pool's rows for every position a list holds:** a 100K-row sorted list made 100K rows for a page of 20; rows are made ahead for the first and last 256 positions only.

## Next

- `grid neighbors 100K main`, 3.66 µs a row against about 1.6 µs for the kernel on one worker: each neighbor costs about 10 ns in loads of the list's state, the pool and the row's slots; rows whose values carry their index and views as their own fields would save a few of them.
- Index refreshes, 141 ns a moved entity: two ordered bucket edits and a probe, in cache.

- `loop tick add remove`, a new system each tick: about 2 µs more a tick since indexes (above), in `System.create` and `add`, as more garbage; the paths a run of an existing system takes measure as before.
- Index rebuilds across the pool: `index rebuild 1M workers` 6.7 ms, nine workers 4.3× one, every phase scattering or gathering by partition; an estimated 2–3 ms if the scatters reached memory bandwidth. Rebuilds are rare, a refresh moving more than an eighth of an index.
- Single-tier runs on workers: workers asleep at the start of a run take 60–135 µs to see the task, and 2–4 of 9 find nothing left to claim.
- Idle cores clock down: after 5 ms idle, even the main thread runs move 2–4× slower per frame, and keeping one other core busy removes most of it, at 10M too. That's the OS's power policy, not something dispatch can avoid without spending power.
- Emit and other command-heavy kernels: the sync point dominates.
- Kernels taking `%` of an f64: a conditional on `resources[clock].tick % 2` costs about 33 ns a row in node, 10K rows 333 µs against 8.5 µs without it.
- Replaying the move log: `log replay` takes 24 ns a move in node and 36.5 ns in chromium, two entries each, against about 1 ns to move the bytes; the cost is the per-entry dispatch and the scattered rows a swap reads.
- Ordered selections recomputed every tick: `mailbox select 10K` spends about 0.73 ms a tick sorting 10K entities.
- A tail's body reading from a snapshot ran slower in one case: a loop counted down from an unbounded integer resource (an f64) took 13.6 ms against 11.2 in place over 10,000 rows of 200 steps, in node, while counted as an i32 it took 10.8 against 11.2; deopts didn't account for it.
- Main-thread spawns reserving in blocks too: `spawn bulk` still takes one atomic add per spawn. Finalizers spawn during the sync point, after it materializes the run's reservations, so a world's block would have to end before each materialization.
