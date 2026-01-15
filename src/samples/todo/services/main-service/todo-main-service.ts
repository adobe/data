// © 2026 Adobe. MIT License. See /LICENSE for details.
import { PersistenceService, UndoRedoService } from '../../../../ecs/index.js';
import { Service } from '../../../../service/index.js';
import { DependentStateService } from '../dependent-state-service/dependent-state-service.js';
import { TodoStateService } from '../state-service/todo-state-service.js';

export interface TodoMainService extends Service {
  readonly serviceName: string;
  state: TodoStateService;
  dependentState: DependentStateService;
  undoRedo: UndoRedoService;
  persistence: PersistenceService;
}

export type TodoCoreService = Omit<TodoMainService, 'dependentState'>;

/**
 * The main service as used by the UI. We only allow access to the observe and actions properties.
 */
export type TodoUIMainService = Omit<TodoMainService, 'state'> & { state: Omit<TodoStateService, 'resources'> };
