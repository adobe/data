# The guide

This folder teaches the ECS to someone who has just started using it, in chapters. `README.md` is its index: the
chapters by part, in order, the unnumbered `Setup` and `Keys and declarations` first, numbered `00-`. Each chapter is
its prose, `NN-name.md`, under a `# Title` that the index gives too, and a program, `NN-name.ts`, whose exported `main`
runs it, and what it prints is in `NN-name.out` beside it. `Setup` has prose alone. The interactive guide, `packages/ecs-guide`, shows each chapter's prose beside its program
in an editor, and runs it.

`guide.test.ts` runs every program and compares what it logged with its `.out`, which mustn't be empty. It checks
that every program has prose and the index lists every chapter by its title; that each chapter's prose names, as code,
what the chapter teaches, its list in `teaches`, and its program does it, outside comments; that each link to a
program's lines points at whole code of the chapter's own files; that code in the prose stays a line or two; and, by
`mutations`, that taking a point a program teaches away changes what it prints, or prints the failure a broken rule
gives. A chapter that shows a type error does
it in `NN-name.type-test.ts`, under a `// @ts-expect-error` that the package's build checks.

## Writing the prose

- The readers are experienced engineers. Keep it concise: short paragraphs and lists, no padding, no marketing, and
  no repeating what the code shows.
- Introduce the chapter's concept, define each term in italics where it first appears, and say how it behaves: what
  runs when, what's kept, and what's rejected and why.
- Code in the prose only where a sentence needs a shape: inline, or a block of a line or two. The program in the
  editor is the demonstration.
- Link the program's lines a sentence speaks of: `[spawns an entity](02-entities.ts#L19-L22)`, or `#L17` for one line.
  On GitHub the link opens the file at those lines; in the interactive guide it selects them in the editor. A link
  covers whole statements or whole members of a declaration. Link another chapter by its prose, `[Reductions](15-reductions.md)`.
- Don't repeat the output, which the run window shows; mention a line of it only where a sentence points at it.
- Never mention `@adobe/data` or any other package that isn't this one. Describe only the current API, with no history.

## Code conventions

- An example imports only the package, as `../index.js`, declares what it uses, and exports `main`, an async function
  that creates its worlds with `World.create()`, runs systems, logs what they did with `console.log`, and disposes its
  worlds before it resolves. Never top-level await.
- Comments are reading aids, short, for what the code doesn't say; the prose carries the explanation.
- What it prints shows the effect of each point it teaches, so leaving one out changes the output: enough entities
  that a filter or a target matters, the values a system wrote read back, what a finalizer did. Add each to
  `mutations`.
- An example that draws finds the element to draw in as `#output`, which the interactive guide's Output tab gives, and
  holds what it draws with in a resource; where there's no page, as in node, a small stand-in takes its place and
  keeps what's drawn, so the systems run the same and the program prints the same. It logs a few deterministic frames,
  ticking at a fixed cadence, then animates until its page goes, or, without one, ends.
- What it prints is deterministic: no timings or random values, and rows in an order the API doesn't define are sorted
  before they're printed.
- Keys are `Symbol()` with no description: the build's id names each by its binding.
- Archetypes are types, so their names are PascalCase: `const Particle = [position, velocity] as const`.
- Use the public API only, as a consumer imports it, not internal modules. Read a world through observer systems.
- Lines change as code does: the test of links fails on any that no longer covers whole code, so move them with it.
