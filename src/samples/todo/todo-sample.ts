// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Sample } from '../index.js';
import './todo-host.js';  // Side effect: registers todo-host

export const todoSample: Sample = {
    id: 'todo',
    title: 'Todo Application',
    description: 'A complete todo application demonstrating ECS architecture, state management, undo/redo, and persistence.',
    category: 'Application Examples',
    difficulty: 'intermediate',
    features: [
        'Entity-Component-System (ECS)',
        'State Management',
        'Undo/Redo System',
        'Local Storage Persistence',
        'Drag and Drop Reordering',
        'Reactive UI Updates'
    ],
    elementTag: 'todo-host'
};