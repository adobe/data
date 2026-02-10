# Undo-Redo System

The undo-redo system provides automatic transaction tracking and optimization for the ECS database.

## Making Transactions Undoable

To make a transaction undoable, set the `undoable` property on the transaction:

```typescript
// Basic undoable transaction (no coalescing)
t.undoable = { coalesce: false };

// Undoable transaction with coalescing
t.undoable = { coalesce: { entity: entityId } };
```

### Parameters

- **`coalesce`** (boolean | unknown): 
  - `false`: Never coalesce with other actions
  - Any other value: Coalesce with actions having the same coalesce value (using deep equality)

### Coalesce Examples

```typescript
// Coalesce by entity
t.undoable = { coalesce: { entity: entityId } };

// Coalesce by component type
t.undoable = { coalesce: { component: "position" } };

// Coalesce by operation type
t.undoable = { coalesce: { operation: "move" } };

// Coalesce by user action
t.undoable = { coalesce: { action: "drag", entity: entityId } };

// No coalescing
t.undoable = { coalesce: false };
```

## Coalescing Logic

The system automatically coalesces adjacent undoable actions to optimize performance:

### When Coalescing Occurs

Transactions are coalesced when:
1. Both actions have the same `coalesce` value (using deep equality)
2. Neither transaction has `coalesce: false`

### Operation Optimization

The system intelligently optimizes operations:

```typescript
// Multiple updates to the same entity → Single update
updateEntity(entity, { position: { x: 1 } });
updateEntity(entity, { position: { y: 2 } });
// Result: Single update with { position: { y: 2 } }

// Insert + Update → Single insert
createEntity({ position: { x: 1 } });
updateEntity(entity, { position: { y: 2 } });
// Result: Single insert with { position: { y: 2 } }

// Insert + Delete → No operation
createEntity({ position: { x: 1 } });
deleteEntity(entity);
// Result: No operations (cancelled out)
```

### Example Usage

```typescript
function createTestDatabase() {
    return createDatabase(baseStore, {
        createEntity(t, args) {
            t.undoable = { coalesce: false };
            return t.archetypes.Entity.insert(args);
        },
        
        updateEntity(t, args) {
            // Coalesce updates on the same entity
            t.undoable = { coalesce: { entity: args.entity } };
            t.update(args.entity, args.values);
        },
        
        updatePosition(t, args) {
            // Coalesce all position updates
            t.undoable = { coalesce: { component: "position" } };
            t.update(args.entity, { position: args.position });
        },
        
        deleteEntity(t, args) {
            t.undoable = { coalesce: false };
            t.delete(args.entity);
        }
    });
}

// Usage
const database = createTestDatabase();
const undoRedo = createUndoRedoActions(database);

// Create and update entity
const entity = database.transactions.createEntity({ position: { x: 1 } });
database.transactions.updateEntity({ entity, values: { position: { y: 2 } } });
database.transactions.updateEntity({ entity, values: { name: "test" } });

// Undo the coalesced operations
undoRedo.undo(); // Undoes the coalesced updates
undoRedo.undo(); // Undoes the create
```
