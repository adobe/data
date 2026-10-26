# Input

A system's *input* is the body's parameter after its context: an object of named fields, which each run passes, as in
`world.run(hit, { amount: 3 })`. The build reads its schema from the parameter's type, so its fields are data.

- A system with input is run, not added: a tick has no input to give it.
- A composite's input has every field its members declare.
- A run resolves to what a system without components returns, so [`spawn`](08-input.ts#L13-L17) hands back the
  entity it spawned.

`target: "entity"` names an input field holding an entity. [`heal`](08-input.ts#L25-L30) then runs on that entity's
row alone, or on none once the entity is gone, so only the player heals.
