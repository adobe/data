---
paths:
  - 'packages/**/*.ts'
  - 'packages/**/*.tsx'
---

# Type casts — only two valid uses

`as` is dangerous. It silently turns off the type checker for the cast
expression. Every cast is a place a future refactor can break in
silence. There are exactly two valid uses:

1. **Proving a type the compiler cannot see.** A runtime invariant you
   have established but TypeScript has no way to verify — e.g.
   "validated JSON matches `User.schema`", "this `unknown` from a loose
   API is `number` because the schema declared it", "this DOM node is
   `HTMLInputElement` because the selector matched `input`".

2. **Widening a literal or default to a useful container type.** A
   resource or component default is `0` (the literal) without help.
   `0 as F32` widens it to `F32` so the resource can hold any number,
   not just zero. Same for `[] as User[]`, `false as boolean`,
   `{} as State`. Without the cast, the inferred type is so narrow it
   blocks every later assignment.

Anything else is the cast hiding a real defect. Most often: an identity
cast that neither narrows nor widens, used to make a type error go
away without fixing the underlying type.

## The acceptance test

Before every `as`, articulate in one sentence which of the two it is:

- **Case 1:** "I know `<expr>` is `<T>` because <runtime invariant>."
- **Case 2:** "I'm widening `<literal>` so the container can hold any `<T>`."

If your sentence reduces to "TypeScript is wrong" or "I just want this
to compile", the cast is hiding a real defect — fix the type at its
source, do not cast at the consumer.

## Common violations

### Identity casts (neither widening nor narrowing)

```ts
// ❌ `cameraAngle + delta` is already F32 (= number). Cast does nothing.
t.resources.cameraAngle = (t.resources.cameraAngle + delta) as F32;

// ✅
t.resources.cameraAngle = t.resources.cameraAngle + delta;
```

### Casting `any` to a specific shape just to call a property

```ts
// ❌ `prev` is already any; the cast adds no information.
const n = (prev as ArrayLike<number>).length;

// ✅
const n = prev.length;
```

### Casting wider than necessary

```ts
// ❌ Loses the value-side type for no reason.
const map = t.componentSchemas as Record<string, any>;

// ✅ Same key widening, but values stay typed as Schema.
const map = t.componentSchemas as Record<string, Schema>;
```

### Casting to silence an error you should fix at the source

```ts
// declaration (your code)
export const emit = (name: string, payload: unknown): void => {
    return inner.send(name, payload);  // actually returns Promise<Ack>
};

// ❌ cast hides the lie; every caller will duplicate it
const ack = await (emit("save", data) as Promise<Ack>);

// ✅ fix the declaration once; every consumer benefits
export const emit = (name: string, payload: unknown): Promise<Ack> => {
    return inner.send(name, payload);
};
```

## When the lying type is in code you control

Fix the declaration. A consumer-side cast is a leaky patch every other
caller will duplicate; one declaration change removes the cast
everywhere and protects future call sites the compiler will now catch.
