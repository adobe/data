---
name: build-game
description: Build a game — an application whose features model game state, rules, and rendering.
input: game
output: game
---

/build-application — a game is an application.

Map game concepts to feature layers: data/ = state + rules (+ per-tick step math),
components/archetypes = entity kinds, indexes = spatial/lookup queries,
transactions = moves/spawns, computed = score/status/winner, ui = view + input.

- **Turn-based** uses the reactive transaction → computed → ui loop, no systems
  (see data-lit-tictactoe).
- **Real-time** adds the `build-systems` phase: a per-frame tick loop (movement,
  collision, lifetime) driven by the scheduler, over many entities in distinct
  archetypes. This is where components, archetypes, indexes, and systems all
  carry real weight — see `features/ecs/systems.md`.
