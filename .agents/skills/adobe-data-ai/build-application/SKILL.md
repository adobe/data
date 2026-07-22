---
name: build-application
description: Build an application — a base feature hosting lazily-loaded peer features.
input: app
output: app
---

/build-feature the base (features/main), then /build-feature each peer feature.

Then wire: main's core-database `imports` each peer's core-database plugin; the base
reaches a peer only through a lazy element wrapper (dynamic import); the entry point
creates the live database from the base plugin and mounts the root UI.
