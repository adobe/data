# Diagrams

`diagrams(files)` draws an app's architecture from what its code imports, as Mermaid diagrams GitHub shows, and
gives the documents it would change as `updates`, with what a person has to fix as `problems`:

- `ARCHITECTURE.md` at the source root shows the features, an arrow from each to what it uses, so the most core is at
  the bottom. Apps are yellow boxes. An arrow a longer path already implies is left out: the app uses `todos` through
  `filter`.
- A feature with several layers gets an `ARCHITECTURE.md` of its own, showing its layers and the features they use:
  of [the app's features](02-diagrams.ts#L12-L17), `todos` has a `model` and a `view`.
- A layer with three parts or more gets a diagram of them in its `README.md`.

Each diagram is the text between `<!-- architecture:start -->` and `<!-- architecture:end -->`; what's around it is
kept. Each box's description is written by a person: the first sentence of a layer's README, or a feature document's
`> ` line, at most 64 characters, so [a longer one](02-diagrams.ts#L28-L29) is a problem.

The program [writes `updates` back](02-diagrams.ts#L30-L31), as `ecs-architecture diagrams` does, and finds the
diagrams current; `ecs-architecture diagrams --check` fails while one isn't.
