# 📋 Plan: Fix Resources Index Signature Type Issue

## 🎯 Problem

The `resources` property on `Database` and `Store` has an implicit index signature that allows accessing any string key, even keys that don't exist. This defeats type safety.

**Current Behavior:**
```typescript
const plugin = Database.Plugin.create({
  resources: {
    time: { default: 0 as number },
  },
}, {
  systems: {
    physicsSystem: {
      create: (db) => () => {
        const time: number = db.resources.time; // ✅ Should work
        // @ts-expect-error - this should be an error
        const dt: number = db.resources.deltaTime2; // ❌ Should error but doesn't!
      }
    }
  }
});
```

The `@ts-expect-error` comment indicates that accessing `deltaTime2` should fail at compile time, but it currently doesn't because TypeScript is inferring an index signature `[x: string]: any` on the resources object.

## 🔍 Root Cause

Located in `src/ecs/store/store.ts`:

```typescript
export interface Store<
    C extends Components = {},
    R extends ResourceComponents = {},  // ResourceComponents = object
    A extends ArchetypeComponents<StringKeyof<C & OptionalComponents>> = {},
> extends BaseStore<C>, Core<C> {
    readonly resources: { -readonly [K in StringKeyof<R>]: R[K] };
    // ...
}
```

The mapped type `{ -readonly [K in StringKeyof<R>]: R[K] }` **should** restrict keys to only those in `R`, but when `R extends object` (which is what `ResourceComponents` is), TypeScript's structural typing allows the mapped type to be treated as having an index signature.

This happens because:
1. `ResourceComponents = object` is too wide a constraint
2. The mapped type doesn't explicitly forbid extra keys
3. TypeScript's type system allows structural compatibility

## 🔧 Solution Strategy

We need to make the `resources` type **exact** - it should only allow keys that exist in `R` and nothing else.

### Option 1: Add Index Signature with `never` (Recommended)

Explicitly add an index signature that returns `never` for keys not in `R`:

```typescript
readonly resources: { 
    readonly [K in StringKeyof<R>]: R[K] 
} & {
    readonly [K in string]: K extends StringKeyof<R> ? R[K] : never
};
```

This technique forces TypeScript to check if a key exists in `R` before allowing access. If the key doesn't exist, the type is `never`, which causes a type error.

**Pros:**
- Explicit and clear intent
- Works with all TypeScript versions
- Doesn't break existing code

**Cons:**
- Slightly more verbose
- The `never` type might show up in IDE hover tooltips

### Option 2: Use `NoInfer` and Exact Types

Create a helper type that enforces exactness:

```typescript
type ExactResources<R extends ResourceComponents> = {
    readonly [K in StringKeyof<R>]: R[K]
} & Record<string, never>;
```

Then use it:
```typescript
readonly resources: ExactResources<R>;
```

**Pros:**
- Cleaner interface definition
- Reusable pattern

**Cons:**
- Might be overly restrictive
- Could interfere with type inference in some edge cases

### Option 3: Tighten `ResourceComponents` Constraint

Change `ResourceComponents` from `object` to something more specific:

```typescript
export type ResourceComponents = Record<string, any>;
```

**Pros:**
- Simple change
- Might help with other type issues

**Cons:**
- Doesn't actually solve the problem (Record still allows index signatures)
- Less semantically correct

## 📋 Implementation Plan

### Phase 1: Define Helper Type

Create a new type helper in `src/ecs/store/store.ts` or `src/types/types.ts`:

```typescript
/**
 * Creates an exact mapped type that rejects access to keys not in T.
 * This prevents implicit index signatures.
 */
export type ExactKeys<T extends object> = {
    [K in keyof T]: T[K]
} & {
    [K in string]: K extends keyof T ? T[K] : never
};
```

### Phase 2: Update Store Interface

Modify `src/ecs/store/store.ts`:

**Before:**
```typescript
export interface Store<
    C extends Components = {},
    R extends ResourceComponents = {},
    A extends ArchetypeComponents<StringKeyof<C & OptionalComponents>> = {},
> extends BaseStore<C>, Core<C> {
    readonly resources: { -readonly [K in StringKeyof<R>]: R[K] };
    // ...
}
```

**After:**
```typescript
export interface Store<
    C extends Components = {},
    R extends ResourceComponents = {},
    A extends ArchetypeComponents<StringKeyof<C & OptionalComponents>> = {},
> extends BaseStore<C>, Core<C> {
    readonly resources: ExactKeys<R>;
    // ...
}
```

Also update `ReadonlyStore` interface similarly:

```typescript
export interface ReadonlyStore<
    C extends Components = never,
    R extends ResourceComponents = never,
    A extends ArchetypeComponents<StringKeyof<C & OptionalComponents>> = never,
> extends BaseStore<C>, ReadonlyCore<C> {
    readonly resources: Readonly<ExactKeys<R>>;
    // ...
}
```

### Phase 3: Update Related Interfaces

Check and update these interfaces if they also have `resources` properties:

1. `TransactionalStore` - `src/ecs/database/transactional-store/transactional-store.ts`
2. `ObservedDatabase` - `src/ecs/database/observed/observed-database.ts` (if it has resources)
3. Any other interfaces that expose `resources`

### Phase 4: Verify Tests

Run the test suite to ensure:
1. All existing tests still pass
2. The `@ts-expect-error` in `database.plugin.create.test.ts` line 71 now correctly catches the error

```bash
pnpm test src/ecs/database/database.plugin.create.test.ts -- --run
```

### Phase 5: Add Explicit Type Tests

Add compile-time type tests to verify the fix works:

In `src/ecs/store/store.ts` or a dedicated type test file:

```typescript
// Type test: Resources should reject non-existent keys
{
    type TestResources = { time: number; delta: number };
    type TestResourcesExact = ExactKeys<TestResources>;
    
    // This should work
    type ValidAccess = TestResourcesExact["time"]; // number
    
    // This should be never
    type InvalidAccess = TestResourcesExact["nonexistent"]; // never
    
    // Compile-time assertion
    type CheckInvalid = True<IsNever<InvalidAccess>>;
}
```

### Phase 6: Update Documentation

If there's any documentation about the `resources` property, add a note that it enforces exact keys.

## 🧪 Testing Strategy

### 1. Unit Tests (Type Level)

Add type-level tests to verify:
- Valid resource access works
- Invalid resource access produces `never`
- The `ExactKeys` helper works correctly

### 2. Integration Tests

Verify the fix in actual database tests:
- Create a database with specific resources
- Attempt to access non-existent resources
- Ensure TypeScript catches the error

### 3. Regression Tests

Run full test suite:
```bash
pnpm test
```

Ensure no existing tests break.

## ✅ Success Criteria

- [ ] `ExactKeys` helper type defined and tested
- [ ] `Store.resources` uses `ExactKeys<R>`
- [ ] `ReadonlyStore.resources` uses `Readonly<ExactKeys<R>>`
- [ ] `TransactionalStore` and other related interfaces updated
- [ ] Test at line 71 of `database.plugin.create.test.ts` correctly produces type error
- [ ] All existing tests pass
- [ ] Type-level tests added to verify fix
- [ ] Build succeeds with no errors
- [ ] IDE autocomplete only shows valid resource keys

## 🚨 Potential Issues

### Issue 1: Breaking Changes

If existing code relies on the loose typing, this could be a breaking change.

**Mitigation:** This is actually fixing a bug (the types were incorrectly permissive), so it should be considered a patch that improves type safety.

### Issue 2: Performance

Adding intersection types with `never` could theoretically slow down type checking.

**Mitigation:** The performance impact should be negligible since this is a simple mapped type. If issues arise, we can benchmark and optimize.

### Issue 3: Complex Error Messages

The `never` type might produce confusing error messages.

**Mitigation:** The error messages should actually be clearer since they'll explicitly state that the key doesn't exist rather than silently allowing access.

## 📚 References

- TypeScript: [Mapped Types](https://www.typescriptlang.org/docs/handbook/2/mapped-types.html)
- TypeScript: [Index Signatures](https://www.typescriptlang.org/docs/handbook/2/objects.html#index-signatures)
- Pattern: [Exact Types in TypeScript](https://github.com/microsoft/TypeScript/issues/12936)

## 🎯 Next Steps

1. Get user approval for this approach
2. Implement `ExactKeys` helper type
3. Update `Store` and `ReadonlyStore` interfaces
4. Update related interfaces
5. Run tests and verify fix
6. Clean up test file (`test-resources-type.ts`)
7. Commit changes

---

**Estimated Time:** 30-45 minutes

**Risk Level:** Low (type-only change, no runtime impact)

**Priority:** High (fixes type safety bug)
