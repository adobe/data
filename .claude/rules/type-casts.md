---
paths:
  - 'packages/**/*.ts'
  - 'packages/**/*.tsx'
---

# Type casts — never to silence a problem

`as` exists to assert a runtime invariant the type system cannot infer
but you have proven (post-validation narrowing, branded types,
third-party declarations that are imprecisely typed upstream). It is
not a way to make a type error go away.

If a cast is the only thing making code compile, the type system is
trying to tell you something. The fix lives at the source of the lying
type — almost always a declaration *you* control — not at the
consumer.

## Example

```ts
// packages/event-bus/src/emit.ts (your code)
export const emit = (name: string, payload: unknown): void => {
    return inner.send(name, payload);  // actually returns Promise<Ack>
};

// at a consumer
// ❌ cast hides the lie; every caller will eventually duplicate it
const ack = await (emit("save", data) as Promise<Ack>);

// ✅ fix the declaration once; every consumer benefits
export const emit = (name: string, payload: unknown): Promise<Ack> => {
    return inner.send(name, payload);
};
```

## Acceptance test for `as`

You may cast when you can articulate, in one sentence, **the runtime
invariant the type system cannot see** — e.g. "the JSON was just
validated against `User.schema`", "this brand was just enforced by
`brandUser()`", "this DOM node is `HTMLInputElement` because the
selector matched `input`".

If your sentence reduces to "TypeScript is wrong" or "I just want this
to compile", the cast is hiding a real defect.

## When the lying type is in code you control

Fix the declaration. A consumer-side cast is a leaky patch every other
caller will duplicate; one declaration change removes the cast
everywhere and protects future call sites the compiler will now catch.
