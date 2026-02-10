// © 2026 Adobe. MIT License. See /LICENSE for details.
import { applyArg } from "@adobe/data/functions";

import * as dependentState from './dependent-state/index.js';

import { TodoCoreService } from '../main-service/todo-main-service.js';

export const createDependentStateService = (service: TodoCoreService) => applyArg(service, dependentState);
