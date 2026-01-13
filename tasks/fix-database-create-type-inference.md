# Fix Database.create Type Inference Plan

## Problem

`Database.create` cannot properly infer types from plugins that use `extends` (which creates `Combine2<...>` nested structures). The current signature requires explicit type parameters that match `Database.Plugin<CS, RS, A, TD, S, AD>`, but `Combine2` wraps these types, preventing TypeScript from matching them.

## Solution Approach

Use the same pattern as `Database.extend`: accept any plugin type and use conditional types with `infer` to extract type parameters.

### Key Insight

`Database.extend` works because it:
1. Accepts `P extends Database.Plugin<any, any, any, any, any, any>` (any plugin type)
2. Uses conditional types: `P extends Database.Plugin<infer XC, any, ...> ? FromSchemas<XC> : never`
3. This works even with `Combine2` wrapped types because `Combine2<P1, P2>` resolves to `Database.Plugin<...>`

### Implementation Strategy

1. **Change `Database.create` signature** to use conditional types with `infer` instead of explicit type parameters
2. **Create helper types** to extract each type parameter (CS, RS, A, TD, S, AD) from any plugin type
3. **Update the overload** that accepts plugins to use the new pattern
4. **Keep runtime implementation unchanged** - only type-level changes

## Steps

1. Create helper types to extract type parameters from any plugin:
   - `ExtractComponents<P>` - extracts CS from plugin P
   - `ExtractResources<P>` - extracts RS from plugin P
   - `ExtractArchetypes<P>` - extracts A from plugin P
   - `ExtractTransactions<P>` - extracts TD from plugin P
   - `ExtractSystems<P>` - extracts S from plugin P
   - `ExtractActions<P>` - extracts AD from plugin P

2. Update `Database.create` overload to:
   - Accept `P extends Database.Plugin<any, any, any, any, any, any>`
   - Return type uses helper types to extract and transform parameters
   - Use `infer` pattern like `Database.extend` does

3. Verify the implementation:
   - Test with simple plugins (no extends)
   - Test with single extends (one Combine2 level)
   - Test with deep nesting (multiple Combine2 levels)
   - Uncomment type tests and verify they pass

## Example

Current (doesn't work with Combine2):
```typescript
export function createDatabase<
    CS extends ComponentSchemas,
    RS extends ResourceSchemas,
    ...
>(plugin: Database.Plugin<CS, RS, A, TD, S, AD>): Database<...>
```

New (works with Combine2):
```typescript
export function createDatabase<
    P extends Database.Plugin<any, any, any, any, any, any>
>(plugin: P): Database<
    FromSchemas<P extends Database.Plugin<infer CS, any, any, any, any, any> ? CS : never>,
    FromSchemas<P extends Database.Plugin<any, infer RS, any, any, any, any> ? RS : never>,
    P extends Database.Plugin<any, any, infer A, any, any, any> ? A : never,
    ToTransactionFunctions<P extends Database.Plugin<any, any, any, infer TD, any, any> ? TD : never>,
    P extends Database.Plugin<any, any, any, any, infer S, any> ? S : never,
    ToActionFunctions<P extends Database.Plugin<any, any, any, any, any, infer AD> ? AD : never>
>
```

