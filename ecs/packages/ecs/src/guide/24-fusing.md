# Kernel fusing

*Kernel fusing* runs [kernels](14-kernels.md) that a schedule runs one after another as one pass over their rows: per
row, each kernel's body in turn. A component they share is read from memory once and kept in registers between
bodies, rather than streamed again by each kernel. The systems stay separate, each with its own declaration and
order, and what they compute is what they compute one after another.

The world fuses a schedule's kernels as it first runs it, without being asked:

- [`regenerate`](24-fusing.ts#L18-L20), [`hurt`](24-fusing.ts#L22-L24) and [`show`](24-fusing.ts#L26-L28) all touch
  `health`, in that order by `after: [regenerate]` and `after: [hurt]`, so
  [`System.create([regenerate, hurt, show, tally])`](24-fusing.ts#L35) runs them as one kernel.
- A kernel joins the earlier kernels it shares a component with where no sync point comes between them and nothing
  running between conflicts with them. The group runs where its last kernel would.
- [`tally`](24-fusing.ts#L31-L33) shares nothing with them and runs on its own: passes over fewer components at once
  stream faster.
- Over an archetype every member matches, the fused kernel runs; over the rest, each kernel runs its own pass, as
  `regenerate` does over the entity with `health` alone.
- A component several members write is stamped changed once a row, with the last member's tick.
- With workers, they claim pieces of the fused kernel as they do of any kernel's.

A kernel fuses when its body computes from its own row and resources alone: no lookups, `up`, `order`, targets,
`where`, change filters, conditions, optional or shared components, reductions, input or writes to typed arrays.
Others run as they are.

**When it pays.** Measured over a million rows:

- Kernels sharing components run faster fused, as long as the fused kernel runs several rows at a time wherever a
  member does: two kernels of four components each, two of them shared, are faster together than apart.
- Kernels sharing nothing are a little slower fused, so they aren't.
- A fused body the compiler can't run several rows at a time is much slower than its members alone, so the world
  keeps a fused kernel only where it keeps their vectors, and otherwise runs them apart.
- Kernels limited by memory gain the most, as on many workers, where the cores share its bandwidth.
