---
name: build-game
description: Build a game — an application whose features model game state, rules, and rendering. Specializes build-application.
---

A game is an application (`build-application`); build it as one or more features where
the layers map to game concepts:

- `data/` — the game state (board, pieces, scores) and rules as pure transforms;
- `ecs/` — materializes that state; **transactions** are the moves (validate turn /
  legality, then apply the `data/` rule); **computed** derives status / winner / views;
- `ui/` — renders the board and dispatches moves as transactions.

Turn-based games use the reactive transaction → computed → ui loop (see the
`data-lit-tictactoe` sample). A real-time game additionally drives a systems/tick loop.
