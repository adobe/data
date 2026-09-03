// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Example usage of AsyncDataService utilities
 *
 * This file demonstrates:
 * 1. Validating a service with AsyncDataService.IsValid
 * 2. Publishing a service's schema on the side via the namespace pattern
 *    (`MyService.schema`) and validating it with IsValidWithCompleteSchema
 * 3. Creating a lazy wrapper with AsyncDataService.createLazy, driven by that schema
 *
 * NOTE: This is a documentation example. The imported services don't exist.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import { Observe } from "../../observe/index.js";
import { Schema } from "../../schema/index.js";
import { Assert } from "../../types/assert.js";
import { Service } from "../service.js";
import { AsyncDataService } from "./async-data-service.js";

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
// SIDELOADED SCHEMA (published beside the service via the namespace pattern)
// ============================================================================

namespace UserService {
  // `value: {}` is a "don't-care" schema (resolves to `any`) — enough to drive
  // lazy wrapping; fill in precise value schemas when the schema is also a
  // published contract. Function `parameters` list only the REQUIRED params.
  export const schema = {
    type: "object",
    properties: {
      currentUser: { type: "observe", value: {} },
      allUsers: { type: "observe", value: {} },
      selectUserById: { type: "function", parameters: [{}], returns: { type: "observe", value: {} } },
      fetchUser: { type: "function", parameters: [{}], returns: { type: "promise", value: {} } },
      updateUser: { type: "function", parameters: [{}, {}], returns: { type: "promise" } },
      clearCache: { type: "function" },
    },
    required: ["currentUser", "allUsers", "selectUserById", "fetchUser", "updateUser", "clearCache"],
    additionalProperties: false,
  } as const satisfies Schema;
}

// ============================================================================
// VALIDATION
// ============================================================================

// Compile-time validation that UserService conforms to AsyncDataService pattern
type _ValidateUserService = Assert<AsyncDataService.IsValid<UserService>>;

// Compile-time validation that the sideloaded schema matches the service exactly
type _ValidateUserSchema = Assert<AsyncDataService.IsValidWithCompleteSchema<UserService, typeof UserService.schema>>;

// ============================================================================
// LAZY WRAPPER
// ============================================================================

/**
 * Create a lazy-loading wrapper for UserService.
 * The real service is only loaded when first accessed; the schema drives wrapping.
 */
export const createLazyUserService = AsyncDataService.createLazy({
  load: async (): Promise<UserService> => {
    // In real code, import the actual service implementation
    // e.g., return import('./user-service-impl.js').then(m => m.createUserService())
    throw new Error('Example only - service implementation not provided');
  },
  schema: UserService.schema,
});

// ============================================================================
// WITH CONSTRUCTOR ARGS
// ============================================================================

interface ConfigurableUserService extends Service {
  config: Observe<{ readonly apiUrl: string }>;
  currentUser: Observe<{ readonly id: string; readonly name: string } | null>;
  fetchUser: (id: string) => Promise<{ readonly id: string; readonly name: string }>;
}

namespace ConfigurableUserService {
  export const schema = {
    type: "object",
    properties: {
      config: { type: "observe", value: {} },
      currentUser: { type: "observe", value: {} },
      fetchUser: { type: "function", parameters: [{}], returns: { type: "promise", value: {} } },
    },
    required: ["config", "currentUser", "fetchUser"],
    additionalProperties: false,
  } as const satisfies Schema;
}

type UserServiceConfig = {
  apiUrl: string;
  timeout?: number;
};

type _ValidateConfigurableUserService = Assert<AsyncDataService.IsValid<ConfigurableUserService>>;
type _ValidateConfigurableUserSchema = Assert<
  AsyncDataService.IsValidWithCompleteSchema<ConfigurableUserService, typeof ConfigurableUserService.schema>
>;

/**
 * Create a lazy-loading wrapper with constructor arguments
 */
export const createLazyConfigurableUserService = AsyncDataService.createLazy({
  load: async (args: UserServiceConfig): Promise<ConfigurableUserService> => {
    // In real code, import and create the service with args
    // e.g., return import('./configurable-impl.js').then(m => m.createService(args))
    console.log('Service config:', args);
    throw new Error('Example only - service implementation not provided');
  },
  schema: ConfigurableUserService.schema,
});
