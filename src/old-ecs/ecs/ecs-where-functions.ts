// © 2026 Adobe. MIT License. See /LICENSE for details.

import { EntityValues, CoreComponents } from "../core-ecs/core-ecs-types.js";
import { WhereClause } from "./ecs-types.js";

/**
 * Converts a declarative where clause to a predicate function
 */
export function whereClauseToPredicate<T extends CoreComponents>(whereClause: WhereClause<T>): (entity: EntityValues<T>) => boolean {
  // Helper function to get nested value
  function getNestedValue(obj: any, path: string[]): any {
    return path.reduce((current, key) => current && current[key], obj);
  }

  // Helper function to check conditions recursively
  function checkCondition(value: any, condition: any): boolean {
    // If condition is a direct value, check for equality
    if (typeof condition !== 'object' || condition === null) {
      return value === condition;
    }

    // If condition is an object but not a comparison operation, it's a nested path
    if (!('==' in condition || '!=' in condition || '<' in condition || '>' in condition || '<=' in condition || '>=' in condition)) {
      // Recursively check all nested conditions
      return Object.entries(condition).every(([key, subCondition]) =>
        checkCondition(value[key], subCondition)
      );
    }

    // Handle comparison operations
    for (const [op, compareValue] of Object.entries(condition)) {
      switch (op) {
        case "==":
          if (value !== compareValue) return false;
          break;
        case "!=":
          if (value === compareValue) return false;
          break;
        case "<":
          if (typeof value === 'number' && typeof compareValue === 'number') {
            if (!(value < compareValue)) return false;
          }
          break;
        case ">":
          if (typeof value === 'number' && typeof compareValue === 'number') {
            if (!(value > compareValue)) return false;
          }
          break;
        case "<=":
          if (typeof value === 'number' && typeof compareValue === 'number') {
            if (!(value <= compareValue)) return false;
          }
          break;
        case ">=":
          if (typeof value === 'number' && typeof compareValue === 'number') {
            if (!(value >= compareValue)) return false;
          }
          break;
      }
    }
    return true;
  }

  return (entity: EntityValues<T>) => {
    for (const [key, condition] of Object.entries(whereClause)) {
      const fieldKey = key as keyof T;
      const value = entity[fieldKey];

      if (!checkCondition(value, condition)) {
        return false;
      }
    }
    return true;
  };
}