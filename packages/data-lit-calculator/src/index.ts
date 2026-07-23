// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Library entry point for lit-calculator.
// Consumers import from this barrel to build their own database or render the UI.

import { ComputedDatabase } from "./features/main/ecs/computed-database/computed-database.js";

export { ComputedDatabase } from "./features/main/ecs/computed-database/computed-database.js";

/**
 * The base calculator plugin (resources + transactions + computed). Kept as a
 * value export for consumers that build their own database from it.
 */
export const calculatorPlugin = ComputedDatabase.plugin;

export { Calculator } from "./features/main/ui/calculator/calculator.js";
export { CalculatorElement } from "./features/main/ui/calculator/calculator-element.js";

export { Digit } from "./features/main/data/digit/digit.js";
export { Operation } from "./features/main/data/operation/operation.js";
export { State } from "./features/main/data/state/state.js";
