// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Example usage of AsyncDataService utilities
 * 
 * This file demonstrates:
 * 1. Validating a service with AsyncDataService.IsValid
 * 2. Creating a lazy wrapper with AsyncDataService.createLazy
 * 
 * NOTE: This is a documentation example. The imported services don't exist.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import { Observe } from "../../observe/index.js";
import { Assert } from "../../types/assert.js";
import { Service } from "../service.js";
import { AsyncDataService } from "./index.js";

// ============================================================================
// EXAMPLE SERVICE INTERFACE
// ============================================================================

interface UserService extends Service {
  // Observe properties
  currentUser: Observe<{ readonly id: string; readonly name: string } | null>;
  allUsers: Observe<ReadonlyArray<{ readonly id: string; readonly name: string }>>;

  // Functions returning Observe
  selectUserById: (id: string) => Observe<{ readonly id: string; readonly name: string } | null>;

  // Functions returning Promise
  fetchUser: (id: string) => Promise<{ readonly id: string; readonly name: string }>;
  updateUser: (id: string, data: { readonly name: string }) => Promise<void>;

  // Functions returning void
  clearCache: () => void;
}

// ============================================================================
// VALIDATION
// ============================================================================

// Compile-time validation that UserService conforms to AsyncDataService pattern
type _ValidateUserService = Assert<AsyncDataService.IsValid<UserService>>;

// ============================================================================
// LAZY WRAPPER
// ============================================================================

/**
 * Create a lazy-loading wrapper for UserService
 * The real service is only loaded when first accessed
 */
export const createLazyUserService = AsyncDataService.createLazy(
  async (): Promise<UserService> => {
    // In real code, import the actual service implementation
    // e.g., return import('./user-service-impl.js').then(m => m.createUserService())
    throw new Error('Example only - service implementation not provided');
  },
  {
    currentUser: 'observe',
    allUsers: 'observe',
    selectUserById: 'fn:observe',
    fetchUser: 'fn:promise',
    updateUser: 'fn:promise',
    clearCache: 'fn:void'
  }
);

// ============================================================================
// WITH CONSTRUCTOR ARGS
// ============================================================================

interface ConfigurableUserService extends Service {
  config: Observe<{ readonly apiUrl: string }>;
  currentUser: Observe<{ readonly id: string; readonly name: string } | null>;
  fetchUser: (id: string) => Promise<{ readonly id: string; readonly name: string }>;
}

type UserServiceConfig = {
  apiUrl: string;
  timeout?: number;
};

type _ValidateConfigurableUserService = Assert<AsyncDataService.IsValid<ConfigurableUserService>>;

/**
 * Create a lazy-loading wrapper with constructor arguments
 */
export const createLazyConfigurableUserService = AsyncDataService.createLazy(
  async (args: UserServiceConfig): Promise<ConfigurableUserService> => {
    // In real code, import and create the service with args
    // e.g., return import('./configurable-impl.js').then(m => m.createService(args))
    console.log('Service config:', args);
    throw new Error('Example only - service implementation not provided');
  },
  {
    config: "observe",
    currentUser: "observe",
    fetchUser: "fn:promise"
  }
);
