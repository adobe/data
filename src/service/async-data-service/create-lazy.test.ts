// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Data } from "../../data.js";
import { Observe } from "../../observe/index.js";
import { Assert } from "../../types/assert.js";
import { Service } from "../service.js";
import { createLazy } from "./create-lazy.js";
import { IsValid } from "./is-valid.js";

// ============================================================================
// TEST SERVICE INTERFACES (Simplified equivalents of real services)
// ============================================================================

// Equivalent to AuthenticationService pattern - only Observe properties and void/Promise actions
interface SimpleAuthService extends Service {
  isSignedIn: Observe<boolean | null>;
  accessToken: Observe<string | null>;
  userProfile: Observe<{ readonly name: string; readonly id: string } | null>;
  
  showSignInDialog: () => void;
  hideSignInDialog: () => void;
  refreshToken: () => Promise<void>;
  signIn: (redirectURL: string) => Promise<void>;
  signOut: (redirectURL?: string) => Promise<void>;
}

type _CheckSimpleAuthService = Assert<IsValid<SimpleAuthService>>;

// Service with function returning Observe
interface ServiceWithObserveFn extends Service {
  allUsers: Observe<ReadonlyArray<string>>;
  selectUser: (id: string) => Observe<{ readonly name: string } | null>;
  fetchData: () => Promise<Data>;
}

type _CheckServiceWithObserveFn = Assert<IsValid<ServiceWithObserveFn>>;

// Service with AsyncGenerator
interface ServiceWithGenerator extends Service {
  status: Observe<string>;
  streamEvents: () => AsyncGenerator<{ readonly type: string; readonly data: Data }>;
  cancel: () => void;
}

type _CheckServiceWithGenerator = Assert<IsValid<ServiceWithGenerator>>;

// Service with constructor args
interface ConfigurableService extends Service {
  config: Observe<{ readonly apiUrl: string }>;
  fetch: (endpoint: string) => Promise<Data>;
}

type _CheckConfigurableService = Assert<IsValid<ConfigurableService>>;

// ============================================================================
// VALID USAGE TESTS
// ============================================================================

// ✅ Test 1: Complete descriptor for SimpleAuthService
const validAuth = createLazy<SimpleAuthService>({
  load: () => Promise.resolve({} as SimpleAuthService),
  properties: {
    isSignedIn: 'observe',
    accessToken: 'observe',
    userProfile: 'observe',
    showSignInDialog: 'fn:void',
    hideSignInDialog: 'fn:void',
    refreshToken: 'fn:promise',
    signIn: 'fn:promise',
    signOut: 'fn:promise'
  }
});

// ✅ Test 2: Service with function returning Observe
const validObserveFn = createLazy<ServiceWithObserveFn>({
  load: () => Promise.resolve({} as ServiceWithObserveFn),
  properties: {
    allUsers: 'observe',
    selectUser: 'fn:observe',
    fetchData: 'fn:promise'
  }
});

// ✅ Test 3: Service with AsyncGenerator
const validGenerator = createLazy<ServiceWithGenerator>({
  load: () => Promise.resolve({} as ServiceWithGenerator),
  properties: {
    status: 'observe',
    streamEvents: 'fn:generator',
    cancel: 'fn:void'
  }
});

// ✅ Test 4: Service with constructor args
type ServiceConfig = {
  apiUrl: string;
  timeout?: number;
};

const validWithArgs = createLazy<ConfigurableService, ServiceConfig>({
  load: (args) => {
    // args is properly typed as ServiceConfig
    console.log(args.apiUrl);
    return Promise.resolve({} as ConfigurableService);
  },
  properties: {
    config: 'observe',
    fetch: 'fn:promise'
  }
});

// ============================================================================
// ERROR TESTS (These should produce TypeScript errors)
// ============================================================================

// ❌ Test 5: Missing property 'refreshToken'
const errorMissing = createLazy<SimpleAuthService>({
  load: () => Promise.resolve({} as SimpleAuthService),
  // @ts-expect-error - Missing property 'refreshToken' in descriptor
  properties: {
    isSignedIn: 'observe',
    accessToken: 'observe',
    userProfile: 'observe',
    showSignInDialog: 'fn:void',
    hideSignInDialog: 'fn:void',
    // Missing: refreshToken
    signIn: 'fn:promise',
    signOut: 'fn:promise'
  }
});

// ❌ Test 6: Wrong descriptor type (observe property marked as fn:observe)
const errorWrongType1 = createLazy<SimpleAuthService>({
  load: () => Promise.resolve({} as SimpleAuthService),
  properties: {
    // @ts-expect-error - Wrong descriptor type
    isSignedIn: 'fn:observe', // WRONG: should be 'observe'
    accessToken: 'observe',
    userProfile: 'observe',
    showSignInDialog: 'fn:void',
    hideSignInDialog: 'fn:void',
    refreshToken: 'fn:promise',
    signIn: 'fn:promise',
    signOut: 'fn:promise'
  }
});

// ❌ Test 7: Wrong descriptor type (void function marked as fn:promise)
const errorWrongType2 = createLazy<SimpleAuthService>({
  load: () => Promise.resolve({} as SimpleAuthService),
  properties: {
    isSignedIn: 'observe',
    accessToken: 'observe',
    userProfile: 'observe',
    // @ts-expect-error - Wrong descriptor type
    showSignInDialog: 'fn:promise', // WRONG: should be 'fn:void'
    hideSignInDialog: 'fn:void',
    refreshToken: 'fn:promise',
    signIn: 'fn:promise',
    signOut: 'fn:promise'
  }
});

// ❌ Test 8: Extra property that doesn't exist in service
const errorExtra = createLazy<ServiceWithObserveFn>({
  load: () => Promise.resolve({} as ServiceWithObserveFn),
  properties: {
    allUsers: 'observe',
    selectUser: 'fn:observe',
    fetchData: 'fn:promise',
    // @ts-expect-error - Extra property
    unknownProperty: 'observe' // EXTRA: doesn't exist in service
  }
});

// ❌ Test 9: Wrong descriptor for fn:observe (marked as observe)
const errorObserveFn = createLazy<ServiceWithObserveFn>({
  load: () => Promise.resolve({} as ServiceWithObserveFn),
  properties: {
    allUsers: 'observe',
    // @ts-expect-error - Wrong descriptor type
    selectUser: 'observe', // WRONG: should be 'fn:observe'
    fetchData: 'fn:promise'
  }
});

// ❌ Test 10: Wrong descriptor for generator
const errorGenerator = createLazy<ServiceWithGenerator>({
  load: () => Promise.resolve({} as ServiceWithGenerator),
  properties: {
    status: 'observe',
    // @ts-expect-error - Wrong descriptor type
    streamEvents: 'fn:promise', // WRONG: should be 'fn:generator'
    cancel: 'fn:void'
  }
});

// ❌ Test 11: Missing constructor args when required
// Note: TypeScript currently doesn't enforce this strictly - the load function
// signature will show it expects args, but won't error if you provide () => Promise<T>
// This is a known TypeScript limitation with conditional types in function parameters.
const errorMissingArgs = createLazy<ConfigurableService, ServiceConfig>({
  load: () => Promise.resolve({} as ConfigurableService), // Should require args but TS doesn't catch it
  properties: {
    config: 'observe',
    fetch: 'fn:promise'
  }
});
