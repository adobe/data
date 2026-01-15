// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Observe } from "../../observe/index.js";
import { TransactionResult } from "../database/transactional-store/transactional-store.js";
import { Service } from "../../service/service.js";

export interface UndoRedoService<C = unknown> extends Service {
    undoStack: Observe<TransactionResult<C>[]>;
    undoStackIndex: Observe<number>;
    undo: () => void;
    redo: () => void;
    undoEnabled: Observe<boolean>;
    redoEnabled: Observe<boolean>;
}
