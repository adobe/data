// © 2026 Adobe. MIT License. See /LICENSE for details.
import { TodoCoreService } from '../../main-service/todo-main-service.js';

export const completeTodos = (service: TodoCoreService) =>
  service.state.observe.select(service.state.archetypes.Todo.components, { where: { complete: true } });
