// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "../entity/entity.js";

/** Internal symbol for restoring a deleted entity at its original id (undo/redo replay). */
export const RESTORE_ENTITY = Symbol("restoreEntity");

/** Internal symbol for deleting an entity while rewinding speculative allocation (transient rollback). */
export const REWIND_DELETE = Symbol("rewindDelete");

type RestoreEntityFn = (entity: Entity, values: unknown) => Entity;
type RewindDeleteFn = (entity: Entity) => Entity | undefined;

type WithRestoreEntity = { [RESTORE_ENTITY]?: RestoreEntityFn };
type WithRewindDelete = { [REWIND_DELETE]?: RewindDeleteFn };

export const attachRewindDelete = <T extends object>(target: T, fn: RewindDeleteFn): T =>
    Object.assign(target, { [REWIND_DELETE]: fn });

export const getRestoreEntity = (target: object): RestoreEntityFn | undefined =>
    (target as WithRestoreEntity)[RESTORE_ENTITY];

export const getRewindDelete = (target: object): RewindDeleteFn | undefined =>
    (target as WithRewindDelete)[REWIND_DELETE];
