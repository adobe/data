# Reductions

A *reduction* folds what many rows contribute into one resource, however the rows are split across workers. Its
[declaration](15-reductions.ts#L13-L17) names the operator: `reduce: "+"`, `"*"`, `"min"`, `"max"`, or bitwise `"&"`,
`"|"`, `"^"`.

- A body contributes with [`reduce[total](value)`](15-reductions.ts#L20-L24), as often as it likes.
- Each run that reduces into a resource starts it at its operator's identity and leaves it holding the fold of every
  contribution.
- Systems can't write a reduced resource; only the fold sets it. Read it after the run, as any resource.

The clock's `wake`, from [Ticks and cadence](04-ticks.md), is a reduction: the earliest time asked for wins.
