# Kernel fusing

*Kernel fusing* runs [kernels](14-kernels.md) that a schedule runs one after another as one pass over their rows: per
row, each kernel's body in turn. A component they share is read from memory once and kept in registers between
bodies, rather than streamed again by each kernel. The systems stay separate, each with its own declaration and
order, and what they compute is what they compute one after another.

The world fuses a schedule's kernels, whether built or asserted with `kernel: true`, as it first runs it, without
being asked:

- [`hurt`](24-fusing.ts#L22-L24) and [`show`](24-fusing.ts#L26-L28) read `health`, which
  [`regenerate`](24-fusing.ts#L18-L20) writes, and run in that order by `after: [regenerate]` and `after: [hurt]`, so
  [`System.create([regenerate, hurt, show, tally])`](24-fusing.ts#L35) runs the three as one kernel.
- A kernel joins the earlier kernels that touch a component it reads, where no sync point comes between them and
  nothing running between conflicts with them. The group runs where its last kernel would.
- [`tally`](24-fusing.ts#L31-L33) reads nothing they touch and runs on its own, as does a kernel sharing only
  components it writes.
- Over an archetype every member matches, the fused kernel runs; over the rest, each kernel runs its own pass, as
  `regenerate` does over the entity with `health` alone.
- A component several members write is stamped changed once a row, with the last member's tick.
- With workers, they claim pieces of the fused kernel as they do of any kernel's.

A kernel fuses when its body computes from its own row and resources alone: no lookups, `up`, `order`, targets,
`where`, change filters, conditions, optional or shared components, reductions, input or writes to typed arrays.
Others run as they are.

**When it pays.** Measured over four million rows, on one thread and on ten:

- A kernel reading a component the kernels before it touch takes it from what they loaded: as fast or up to 40%
  faster fused, more the more it shares and the more each row computes.
- A kernel sharing only components it writes ranged from 44% faster to 16% slower, and one sharing nothing up to 24%
  slower, streaming more components at once. These run alone.
- A fused body the compiler can't run several rows at a time ran two to three times slower than its members, so the
  world keeps a fused kernel only where it keeps their vectors.
