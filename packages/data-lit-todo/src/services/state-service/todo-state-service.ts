// © 2026 Adobe. MIT License. See /LICENSE for details.
import { type TodoDatabase } from './create-todo-database.js';
import { FromArchetype } from "@adobe/data/ecs";

export type TodoStateService = TodoDatabase;

export type Todo = FromArchetype<TodoDatabase['archetypes']['Todo']>;

export type DragTodoFunction = TodoStateService['transactions']['dragTodo'];
