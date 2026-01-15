// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { shouldCoalesceTransactions, coalesceTransactions } from "./coalesce-actions.js";
import { TransactionResult } from "./transactional-store.js";

describe("shouldCoalesceTransactions", () => {
    it("should return true for actions with same coalesce values", () => {
        const previous: TransactionResult<any> = {
            value: 1,
            transient: false,
            undoable: { coalesce: { id: "updateEntity", entity: 123 } },
            redo: [],
            undo: [],
            changedEntities: new Map(),
            changedComponents: new Set(),
            changedArchetypes: new Set(),
        };

        const current: TransactionResult<any> = {
            value: 2,
            transient: false,
            undoable: { coalesce: { id: "updateEntity", entity: 123 } },
            redo: [],
            undo: [],
            changedEntities: new Map(),
            changedComponents: new Set(),
            changedArchetypes: new Set(),
        };

        expect(shouldCoalesceTransactions(previous, current)).toBe(true);
    });

    it("should return false for actions with different coalesce values", () => {
        const previous: TransactionResult<any> = {
            value: 1,
            transient: false,
            undoable: { coalesce: { id: "updateEntity", entity: 123 } },
            redo: [],
            undo: [],
            changedEntities: new Map(),
            changedComponents: new Set(),
            changedArchetypes: new Set(),
        };

        const current: TransactionResult<any> = {
            value: 2,
            transient: false,
            undoable: { coalesce: { id: "updateEntity", entity: 456 } },
            redo: [],
            undo: [],
            changedEntities: new Map(),
            changedComponents: new Set(),
            changedArchetypes: new Set(),
        };

        expect(shouldCoalesceTransactions(previous, current)).toBe(false);
    });

    it("should return false when previous transaction has coalesce: false", () => {
        const previous: TransactionResult<any> = {
            value: 1,
            transient: false,
            undoable: { coalesce: false },
            redo: [],
            undo: [],
            changedEntities: new Map(),
            changedComponents: new Set(),
            changedArchetypes: new Set(),
        };

        const current: TransactionResult<any> = {
            value: 2,
            transient: false,
            undoable: { coalesce: { id: "updateEntity", entity: 123 } },
            redo: [],
            undo: [],
            changedEntities: new Map(),
            changedComponents: new Set(),
            changedArchetypes: new Set(),
        };

        expect(shouldCoalesceTransactions(previous, current)).toBe(false);
    });

    it("should return false when current transaction has coalesce: false", () => {
        const previous: TransactionResult<any> = {
            value: 1,
            transient: false,
            undoable: { coalesce: { id: "updateEntity", entity: 123 } },
            redo: [],
            undo: [],
            changedEntities: new Map(),
            changedComponents: new Set(),
            changedArchetypes: new Set(),
        };

        const current: TransactionResult<any> = {
            value: 2,
            transient: false,
            undoable: { coalesce: false },
            redo: [],
            undo: [],
            changedEntities: new Map(),
            changedComponents: new Set(),
            changedArchetypes: new Set(),
        };

        expect(shouldCoalesceTransactions(previous, current)).toBe(false);
    });

    it("should return false when previous transaction has no undoable", () => {
        const previous: TransactionResult<any> = {
            value: 1,
            transient: false,
            undoable: null,
            redo: [],
            undo: [],
            changedEntities: new Map(),
            changedComponents: new Set(),
            changedArchetypes: new Set(),
        };

        const current: TransactionResult<any> = {
            value: 2,
            transient: false,
            undoable: { coalesce: { id: "updateEntity", entity: 123 } },
            redo: [],
            undo: [],
            changedEntities: new Map(),
            changedComponents: new Set(),
            changedArchetypes: new Set(),
        };

        expect(shouldCoalesceTransactions(previous, current)).toBe(false);
    });

    it("should return false when current transaction has no undoable", () => {
        const previous: TransactionResult<any> = {
            value: 1,
            transient: false,
            undoable: { coalesce: { id: "updateEntity", entity: 123 } },
            redo: [],
            undo: [],
            changedEntities: new Map(),
            changedComponents: new Set(),
            changedArchetypes: new Set(),
        };

        const current: TransactionResult<any> = {
            value: 2,
            transient: false,
            undoable: null,
            redo: [],
            undo: [],
            changedEntities: new Map(),
            changedComponents: new Set(),
            changedArchetypes: new Set(),
        };

        expect(shouldCoalesceTransactions(previous, current)).toBe(false);
    });
});

describe("coalesceTransactions", () => {
    it("should combine redo and undo operations", () => {
        const previous: TransactionResult<any> = {
            value: 1,
            transient: false,
            undoable: { coalesce: { id: "updateEntity", entity: 123 } },
            redo: [{ type: "update", entity: 123, values: { position: { x: 1 } } }],
            undo: [{ type: "update", entity: 123, values: { position: { x: 0 } } }],
            changedEntities: new Map([[123, { position: { x: 1 } }]]),
            changedComponents: new Set(["position"]),
            changedArchetypes: new Set([1]),
        };

        const current: TransactionResult<any> = {
            value: 2,
            transient: false,
            undoable: { coalesce: { id: "updateEntity", entity: 123 } },
            redo: [{ type: "update", entity: 123, values: { position: { y: 2 } } }],
            undo: [{ type: "update", entity: 123, values: { position: { y: 0 } } }],
            changedEntities: new Map([[123, { position: { y: 2 } }]]),
            changedComponents: new Set(["position"]),
            changedArchetypes: new Set([1]),
        };

        const result = coalesceTransactions(previous, current);

        expect(result.redo).toHaveLength(1);
        expect(result.redo[0]).toEqual({
            type: "update",
            entity: 123,
            values: { position: { y: 2 } }
        });

        expect(result.undo).toHaveLength(1);
        expect(result.undo[0]).toEqual({
            type: "update",
            entity: 123,
            values: { position: { x: 0 } }
        });
    });

    it("should merge changed entities, components, and archetypes", () => {
        const previous: TransactionResult<any> = {
            value: 1,
            transient: false,
            undoable: { coalesce: { id: "updateEntity", entity: 123 } },
            redo: [],
            undo: [],
            changedEntities: new Map([[123, { position: { x: 1 } }]]),
            changedComponents: new Set(["position"]),
            changedArchetypes: new Set([1]),
        };

        const current: TransactionResult<any> = {
            value: 2,
            transient: false,
            undoable: { coalesce: { id: "updateEntity", entity: 123 } },
            redo: [],
            undo: [],
            changedEntities: new Map([[456, { name: "test" }]]),
            changedComponents: new Set(["name"]),
            changedArchetypes: new Set([2]),
        };

        const result = coalesceTransactions(previous, current);

        expect(result.changedEntities.size).toBe(2);
        expect(result.changedEntities.get(123)).toEqual({ position: { x: 1 } });
        expect(result.changedEntities.get(456)).toEqual({ name: "test" });

        expect(result.changedComponents.size).toBe(2);
        expect(result.changedComponents.has("position")).toBe(true);
        expect(result.changedComponents.has("name")).toBe(true);

        expect(result.changedArchetypes.size).toBe(2);
        expect(result.changedArchetypes.has(1)).toBe(true);
        expect(result.changedArchetypes.has(2)).toBe(true);
    });

    it("should use current transaction's value, transient, and undoable", () => {
        const previous: TransactionResult<any> = {
            value: 1,
            transient: false,
            undoable: { coalesce: { id: "updateEntity", entity: 123 } },
            redo: [],
            undo: [],
            changedEntities: new Map(),
            changedComponents: new Set(),
            changedArchetypes: new Set(),
        };

        const current: TransactionResult<any> = {
            value: 2,
            transient: true,
            undoable: { coalesce: { id: "updateEntity", entity: 123 } },
            redo: [],
            undo: [],
            changedEntities: new Map(),
            changedComponents: new Set(),
            changedArchetypes: new Set(),
        };

        const result = coalesceTransactions(previous, current);

        expect(result.value).toBe(2);
        expect(result.transient).toBe(true);
        expect(result.undoable).toEqual({ coalesce: { id: "updateEntity", entity: 123 } });
    });

    it("should NOT optimize insert + update operations (cannot verify same entity)", () => {
        const previous: TransactionResult<any> = {
            value: 1,
            transient: false,
            undoable: { coalesce: { id: "createEntity", entity: 123 } },
            redo: [{ type: "insert", values: { position: { x: 1 } } }],
            undo: [{ type: "delete", entity: 123 }],
            changedEntities: new Map([[123, { position: { x: 1 } }]]),
            changedComponents: new Set(["position"]),
            changedArchetypes: new Set([1]),
        };

        const current: TransactionResult<any> = {
            value: 2,
            transient: false,
            undoable: { coalesce: { id: "updateEntity", entity: 123 } },
            redo: [{ type: "update", entity: 123, values: { position: { y: 2 } } }],
            undo: [{ type: "update", entity: 123, values: { position: { y: 0 } } }],
            changedEntities: new Map([[123, { position: { y: 2 } }]]),
            changedComponents: new Set(["position"]),
            changedArchetypes: new Set([1]),
        };

        const result = coalesceTransactions(previous, current);

        // Cannot safely optimize insert + update since insert doesn't have entity ID
        expect(result.redo).toHaveLength(2);
        expect(result.redo[0]).toEqual({
            type: "insert",
            values: { position: { x: 1 } }
        });
        expect(result.redo[1]).toEqual({
            type: "update",
            entity: 123,
            values: { position: { y: 2 } }
        });
    });

    it("should NOT optimize insert + delete operations (cannot verify same entity)", () => {
        const previous: TransactionResult<any> = {
            value: 1,
            transient: false,
            undoable: { coalesce: { id: "createEntity", entity: 123 } },
            redo: [{ type: "insert", values: { position: { x: 1 } } }],
            undo: [{ type: "delete", entity: 123 }],
            changedEntities: new Map([[123, { position: { x: 1 } }]]),
            changedComponents: new Set(["position"]),
            changedArchetypes: new Set([1]),
        };

        const current: TransactionResult<any> = {
            value: 2,
            transient: false,
            undoable: { coalesce: { id: "deleteEntity", entity: 123 } },
            redo: [{ type: "delete", entity: 123 }],
            undo: [{ type: "insert", values: { position: { x: 1 } } }],
            changedEntities: new Map([[123, null]]),
            changedComponents: new Set(["position"]),
            changedArchetypes: new Set([1]),
        };

        const result = coalesceTransactions(previous, current);

        // Cannot safely cancel without knowing if insert and delete are on the same entity
        // Insert operations don't carry an entity ID, so we can't match them
        expect(result.redo).toHaveLength(2);
        expect(result.redo[0]).toEqual({ type: "insert", values: { position: { x: 1 } } });
        expect(result.redo[1]).toEqual({ type: "delete", entity: 123 });
        
        expect(result.undo).toHaveLength(2);
        expect(result.undo[0]).toEqual({ type: "insert", values: { position: { x: 1 } } });
        expect(result.undo[1]).toEqual({ type: "delete", entity: 123 });
    });

    it("should handle multiple update operations on same entity", () => {
        const previous: TransactionResult<any> = {
            value: 1,
            transient: false,
            undoable: { coalesce: { id: "updateEntity", entity: 123 } },
            redo: [{ type: "update", entity: 123, values: { position: { x: 1 } } }],
            undo: [{ type: "update", entity: 123, values: { position: { x: 0 } } }],
            changedEntities: new Map([[123, { position: { x: 1 } }]]),
            changedComponents: new Set(["position"]),
            changedArchetypes: new Set([1]),
        };

        const current: TransactionResult<any> = {
            value: 2,
            transient: false,
            undoable: { coalesce: { id: "updateEntity", entity: 123 } },
            redo: [
                { type: "update", entity: 123, values: { position: { y: 2 } } },
                { type: "update", entity: 123, values: { name: "test" } }
            ],
            undo: [
                { type: "update", entity: 123, values: { position: { y: 0 } } },
                { type: "update", entity: 123, values: { name: "" } }
            ],
            changedEntities: new Map([[123, { position: { y: 2 }, name: "test" }]]),
            changedComponents: new Set(["position", "name"]),
            changedArchetypes: new Set([1]),
        };

        const result = coalesceTransactions(previous, current);

        // Should combine all updates into a single operation
        expect(result.redo).toHaveLength(1);
        expect(result.redo[0]).toEqual({
            type: "update",
            entity: 123,
            values: { position: { y: 2 }, name: "test" }
        });

        expect(result.undo).toHaveLength(1);
        expect(result.undo[0]).toEqual({
            type: "update",
            entity: 123,
            values: { position: { x: 0 }, name: "" }
        });
    });

    it("should optimize update + delete operations on same entity", () => {
        const previous: TransactionResult<any> = {
            value: 1,
            transient: false,
            undoable: { coalesce: { id: "updateEntity", entity: 123 } },
            redo: [{ type: "update", entity: 123, values: { position: { x: 1 } } }],
            undo: [{ type: "update", entity: 123, values: { position: { x: 0 } } }],
            changedEntities: new Map([[123, { position: { x: 1 } }]]),
            changedComponents: new Set(["position"]),
            changedArchetypes: new Set([1]),
        };

        const current: TransactionResult<any> = {
            value: 2,
            transient: false,
            undoable: { coalesce: { id: "deleteEntity", entity: 123 } },
            redo: [{ type: "delete", entity: 123 }],
            undo: [{ type: "insert", values: { position: { x: 1 } } }],
            changedEntities: new Map([[123, null]]),
            changedComponents: new Set(["position"]),
            changedArchetypes: new Set([1]),
        };

        const result = coalesceTransactions(previous, current);

        // Should optimize to just the delete operation (the update is pointless)
        expect(result.redo).toHaveLength(1);
        expect(result.redo[0]).toEqual({
            type: "delete",
            entity: 123
        });

        // Undo: cannot safely merge insert + update, so we keep both
        expect(result.undo).toHaveLength(2);
        expect(result.undo[0]).toEqual({
            type: "insert",
            values: { position: { x: 1 } }
        });
        expect(result.undo[1]).toEqual({
            type: "update",
            entity: 123,
            values: { position: { x: 0 } }
        });
    });

    it("should NOT merge insert + update on different entities", () => {
        const previous: TransactionResult<any> = {
            value: 1,
            transient: false,
            undoable: { coalesce: { id: "createEntity", entity: 123 } },
            redo: [{ type: "insert", values: { position: { x: 1 } } }],
            undo: [{ type: "delete", entity: 123 }],
            changedEntities: new Map([[123, { position: { x: 1 } }]]),
            changedComponents: new Set(["position"]),
            changedArchetypes: new Set([1]),
        };

        const current: TransactionResult<any> = {
            value: 2,
            transient: false,
            undoable: { coalesce: { id: "updateEntity", entity: 456 } },
            redo: [{ type: "update", entity: 456, values: { position: { y: 2 } } }],
            undo: [{ type: "update", entity: 456, values: { position: { y: 0 } } }],
            changedEntities: new Map([[456, { position: { y: 2 } }]]),
            changedComponents: new Set(["position"]),
            changedArchetypes: new Set([1]),
        };

        const result = coalesceTransactions(previous, current);

        // Should NOT merge since we can't verify they're the same entity
        expect(result.redo).toHaveLength(2);
        expect(result.redo[0]).toEqual({ type: "insert", values: { position: { x: 1 } } });
        expect(result.redo[1]).toEqual({ type: "update", entity: 456, values: { position: { y: 2 } } });
    });
}); 