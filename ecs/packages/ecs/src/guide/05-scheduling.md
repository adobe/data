# Scheduling and composites

`after`, `before` and `during` order a system against others, listing the systems themselves:
[`heal`](05-scheduling.ts#L22-L24) runs `after: [hit]`.

A *composite* is a list of systems, `System.create([heal, hit])`, run as one system. Its members run in the order
their constraints give, not the order they're listed, so [`frame`](05-scheduling.ts#L25) hits before it heals.
Members with no order between them may run in parallel; two that write what the other reads or writes must be
ordered, or the composite is rejected, unless their rows never match one entity, one's `not` naming a component the
other requires, and they use what they share only through their rows. `System.create({ systems, after, ... })`
declares a composite with constraints of its own.

A *phase* is a system that does nothing, such as [`update` and `render`](05-scheduling.ts#L32-L33). A system
`during: [update]` runs after what `update` follows and before what follows `update`. Phases let systems written apart
agree on an order without naming each other: in [`phased`](05-scheduling.ts#L40), `poison` runs before `report`.

`before` and `after` also take a resource: a system listing one runs before, or after, every other system of the
composite that uses it, as [`harden`](05-scheduling.ts#L43) runs `before: [difficulty]`, so `scale` reads the
difficulty it set. One that must read the value before it's written says so of the writer itself, `before: [harden]`;
two systems listing the same resource aren't ordered with each other by it, so two writers still need an order.
