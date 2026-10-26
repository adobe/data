# Scheduling and composites

`after`, `before` and `during` order a system against others, listing the systems themselves:
[`heal`](05-scheduling.ts#L18-L20) runs `after: [hit]`.

A *composite* is a list of systems, `System.create([heal, hit])`, run as one system. Its members run in the order
their constraints give, not the order they're listed, so [`frame`](05-scheduling.ts#L21) hits before it heals.
Members with no order between them may run in parallel; two that write what the other reads or writes must be
ordered, or the composite is rejected. `System.create({ systems, after, ... })` declares a composite with constraints
of its own.

A *phase* is a system that does nothing, such as [`update` and `render`](05-scheduling.ts#L28-L29). A system
`during: [update]` runs after what `update` follows and before what follows `update`. Phases let systems written apart
agree on an order without naming each other: in [`phased`](05-scheduling.ts#L36), `poison` runs before `report`.
