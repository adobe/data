// © 2026 Adobe. MIT License. See /LICENSE for details.

// Asymmetric matchers for a value a case does not pin — chiefly an entity `id`
// the ecs assigns from its own id-space, so the spec and the ecs projection
// satisfy the same case without agreeing on the value. Plain `{ asymmetricMatch }`
// objects (no test-framework dependency), recognised by `matches` and
// interchangeable with vitest's `expect.any(Number)` / `expect.any(String)`.
const numberMatcher = { asymmetricMatch: (actual: unknown): boolean => typeof actual === "number" };
const stringMatcher = { asymmetricMatch: (actual: unknown): boolean => typeof actual === "string" };

// Typed as the value each stands in for (as vitest types `expect.any`), so it
// slots into a pinned `number` / `string` field of a case's expected value;
// `matches` recognises the object at runtime by its `asymmetricMatch` method.
export const anyNumber = numberMatcher as unknown as number;
export const anyString = stringMatcher as unknown as string;
