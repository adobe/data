# Rules

A *rule* derives components from others: entities matching it have what it derives, only while they match.
`Rule.create` declares one at module scope, with a match like a system's and the components it derives.

- A derived component is [declared](09-rules.ts#L15-L16) with `derived: true`. Only rules add and remove it; it
  starts at its default.
- [Several rules](09-rules.ts#L20-L21) may derive one component, which an entity has while any of them matches.
- Rules build on what others derive: [`layer`](09-rules.ts#L22) follows from `drawn`.

Rules apply at each sync point. When [`hide`](09-rules.ts#L29-L31) adds `hidden` to the sprite, it stops matching,
so it loses `drawn`, and with it `layer`.
