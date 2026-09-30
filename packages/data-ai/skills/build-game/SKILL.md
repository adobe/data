---
name: build-game
description: Build a game — an application whose features model game state, rules, and rendering.
input: game
output: game
---

/build-application — a game is an application.

Map game concepts to feature layers: data/ = value types, rules math, components,
resources (the board, the player, the score) and entities (the pieces); spec/ = the
game state + moves (+ the per-frame `step`); indexes = spatial/lookup queries;
transactions + actions = moves/spawns; computed = score/status/winner; ui = view + input.

- **Turn-based** uses the reactive transaction → computed → ui loop, no systems
  (see data-lit-tictactoe).
- **Real-time** adds the `build-systems` phase: a per-frame tick loop (movement,
  collision, lifetime) driven by the scheduler, over many entities in distinct
  archetypes. Systems must stay O(1) per touched entity — never project the whole
  `State` into/out of the store each frame, and never turn per-row work into per-entity
  transactions. `step` conforms by driving one frame (see `features/ecs/systems.md`).
  This is where components, archetypes, indexes, and systems all carry real
  weight.
