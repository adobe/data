// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Library entry point for lit-calculator.
// Consumers import from this barrel to build their own database or render the UI.

export { FeatureDatabase as CalculatorDatabase } from "./features/main/ecs/feature-database.js";

export { Calculator } from "./features/main/ui/calculator/calculator.js";
export { CalculatorElement } from "./features/main/ui/calculator/calculator-element.js";

export { Digit } from "./features/main/data/digit/digit.js";
export { Operation } from "./features/main/data/operation/operation.js";
export { State } from "./features/main/data/state/state.js";
