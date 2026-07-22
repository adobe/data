---
name: build-game
description: Build a game — an application whose features model game state, rules, and rendering.
input: game
output: game
---

/build-application — a game is an application.

Map game concepts to feature layers: data/ = state + rules, transactions = moves,
computed = status/winner, ui = board + input. Turn-based uses the reactive
transaction → computed → ui loop (see data-lit-tictactoe); real-time adds a
systems/tick loop.
