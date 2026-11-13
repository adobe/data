# Derived components

A *derived component* follows from others: entities have it while they match a derivation of it, and only then.
`Component.derive` declares one, in the file that declares the component, with the components entities have, `from`,
and don't, `not`. It applies in every world.

- A derived component is [declared](09-derived-components.ts#L15-L16) with `derived: true`. Only derivations add and
  remove it; it starts at its default.
- [Several derivations](09-derived-components.ts#L20-L21) may derive one component, which an entity has while any of
  them matches.
- Derivations build on what others derive: [`layer`](09-derived-components.ts#L22) follows from `drawn`.

Derivations apply at each sync point. When [`hide`](09-derived-components.ts#L29-L31) adds `hidden` to the sprite, it
stops matching, so it loses `drawn`, and with it `layer`.
