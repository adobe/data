# The guide

`guide.md` in this folder teaches the ECS to someone who has just started using it. The files beside it are the
code it shows: every excerpt comes from a file here that runs as a test, so the guide can't drift from the API.

## Writing the guide

- Teach how to use the API, concisely. A reader is learning, so show the common case and stop.
- Prefer concise TypeScript with a few comments for what isn't obvious over prose that explains the code.
- Explain behaviour only as far as using it needs: "you're notified when values change, at most once per frame", not
  the exact timing rules. Detailed rules belong in a glossary or appendix, not in a lesson.
- Don't document what throws. Throws aren't part of the documented contract; readers meet them when they happen, and
  compile-time checks prevent most mistakes.
- Never mention `@adobe/data` or any other package that isn't this one. It means nothing to a consumer.
- Describe only the current API, with no history.
- Keep it small. Write sections for the basics and intermediate topics; advanced topics are placeholders until the
  API settles.

## Structure

- **Setup:** its own short section before the basics: the build plugin and how keys are registered and declared.
- **Basics:** resources, then entities, components and archetypes, which together are the whole data model, then
  systems, and ticks and cadence: everything needed to build and run a world and its loop. Topics that belong together
  share a section; entities are taught with components, and archetypes, named lists of components, with them.
- **Intermediate:** scheduling and composites, sync points, change filters and conditions, input, rules, finalizers
  and change sets, and traits with within and references.
- **Advanced:** placeholders only.

## Code conventions

- Keys are short: `Symbol("position")`, never a path like `"guide/components/position"`. A resource's description says
  nothing about components.
- Archetypes are types, so their names are PascalCase: `const Particle = Archetype.create([position, velocity])`.
- Use the public API only, as a consumer imports it, not internal modules. Read a world through observer systems.
