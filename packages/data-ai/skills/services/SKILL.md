---
name: services
description: Use when authoring or editing code in a services/ folder — async capability contracts and implementations.
paths:
  - '**/services/**'
---

@see /namespace @see /structure @see @adobe/data AsyncDataService

The `services/` folder holds async ports: processing, persistence, observation, and generation.

constraints {
  - live in `services/<name>/`; export and folder suffixed `-service`
  - contract is an `interface` — the only `interface` use in our codebase
  - validate immediately: `Assert<AsyncDataService.IsValid<typeof MyService>>`
  - inputs and outputs are pure immutable Data only — service-specific wire/API shapes, not archetype-derived types
  - define related I/O types in nested /namespace folders re-exported by the service
  - members are async only: `void | Promise<T> | AsyncGenerator<T> | Observe<T>`
  - each entry is a /namespace folder
  - provide `create*` factories; large factories use subfolders per /namespace
}

Async enables cross-process portability and lazy loading (@see AsyncDataService.createLazy).
