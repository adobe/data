// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, test } from 'vitest';
import { assert } from 'riteway/vitest';
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
// PATTERNS FROM REAL SERVICE CONTRACTS (names changed for open-source use)
// ============================================================================

// Session service: nullable-not-undefined observables, optional trailing params.
// Mirrors the authentication-service shape from a real platform codebase.
interface SessionService extends Service {
  isActive: Observe<boolean | null>;
  token: Observe<string | null>;
  profile: Observe<{ readonly id: string; readonly name: string } | null>;
  isDialogOpen: Observe<boolean>;

  openDialog(scenario?: string): void;
  closeDialog(): void;
  refresh(): Promise<void>;
  validate(): Promise<boolean>;
  signIn(redirectUrl: string, openInTab: boolean): Promise<void>;
  signOut(redirectUrl?: string): Promise<void>;
  dispose(): void;
}

type _CheckSessionService = Assert<IsValid<SessionService>>;

// Quota service: optional config object with nested optional booleans,
// return type contains optional string fields.
// Mirrors the storage-quota-service shape from a real platform codebase.
type QuotaInfo = {
  readonly used: number | null;
  readonly total: number | null;
  readonly isExceeded: boolean;
  readonly manageUrl?: string;
  readonly raw?: Data;
};

interface QuotaService extends Service {
  fetch(options?: { forceRefresh?: boolean }): Promise<QuotaInfo>;
}

type _CheckQuotaService = Assert<IsValid<QuotaService>>;

// Recognition service: optional Partial<Config> param.
// Mirrors the dictation-service shape from a real platform codebase.
type RecognitionConfig = {
  readonly language: 'en-US' | 'en-GB';
  readonly continuous: boolean;
  readonly maxResults: number;
};

interface RecognitionService extends Service {
  status: Observe<'idle' | 'active' | 'error'>;
  text: Observe<{ readonly transcript: string; readonly isFinal: boolean }>;
  start(config?: Partial<RecognitionConfig>): void;
  stop(): void;
  dispose(): void;
}

type _CheckRecognitionService = Assert<IsValid<RecognitionService>>;

// ============================================================================
// VALID USAGE TESTS
// ============================================================================

// ✅ Test 1: Complete schema for SimpleAuthService
const validAuth = createLazy({
  load: () => Promise.resolve({} as SimpleAuthService),
  schema: {
    type: "object",
    properties: {
      isSignedIn: { type: "observe", value: {} },
      accessToken: { type: "observe", value: {} },
      userProfile: { type: "observe", value: {} },
      showSignInDialog: { type: "function", signature: { parameters: [] } },
      hideSignInDialog: { type: "function", signature: { parameters: [] } },
      refreshToken: { type: "function", signature: { parameters: [], returns: { type: "promise", value: {} } } },
      signIn: { type: "function", signature: { parameters: [{ name: "arg0", schema: {} }], returns: { type: "promise", value: {} } } },
      signOut: { type: "function", signature: { parameters: [], returns: { type: "promise", value: {} } } }
    },
    required: ["isSignedIn", "accessToken", "userProfile", "showSignInDialog", "hideSignInDialog", "refreshToken", "signIn", "signOut"],
    additionalProperties: false
  }
});

// ✅ Test 2: Service with function returning Observe
const validObserveFn = createLazy({
  load: () => Promise.resolve({} as ServiceWithObserveFn),
  schema: {
    type: "object",
    properties: {
      allUsers: { type: "observe", value: {} },
      selectUser: { type: "function", signature: { parameters: [{ name: "arg0", schema: {} }], returns: { type: "observe", value: {} } } },
      fetchData: { type: "function", signature: { parameters: [], returns: { type: "promise", value: {} } } }
    },
    required: ["allUsers", "selectUser", "fetchData"],
    additionalProperties: false
  }
});

// ✅ Test 3: Service with AsyncGenerator
const validGenerator = createLazy({
  load: () => Promise.resolve({} as ServiceWithGenerator),
  schema: {
    type: "object",
    properties: {
      status: { type: "observe", value: {} },
      streamEvents: { type: "function", signature: { parameters: [], returns: { type: "generator", value: {} } } },
      cancel: { type: "function", signature: { parameters: [] } }
    },
    required: ["status", "streamEvents", "cancel"],
    additionalProperties: false
  }
});

// ✅ Test 4: Service with constructor args
type ServiceConfig = {
  apiUrl: string;
  timeout?: number;
};

const validWithArgs = createLazy({
  load: (args: ServiceConfig) => {
    // args is properly typed as ServiceConfig
    console.log(args.apiUrl);
    return Promise.resolve({} as ConfigurableService);
  },
  schema: {
    type: "object",
    properties: {
      config: { type: "observe", value: {} },
      fetch: { type: "function", signature: { parameters: [{ name: "arg0", schema: {} }], returns: { type: "promise", value: {} } } }
    },
    required: ["config", "fetch"],
    additionalProperties: false
  }
});

// ✅ Test 4b: preload flag is accepted
const validWithPreload = createLazy({
  load: () => Promise.resolve({} as ServiceWithObserveFn),
  schema: {
    type: "object",
    properties: {
      allUsers: { type: "observe", value: {} },
      selectUser: { type: "function", signature: { parameters: [{ name: "arg0", schema: {} }], returns: { type: "observe", value: {} } } },
      fetchData: { type: "function", signature: { parameters: [], returns: { type: "promise", value: {} } } }
    },
    required: ["allUsers", "selectUser", "fetchData"],
    additionalProperties: false
  },
  preload: true
});

// ✅ Test 4c: a service that is NOT a valid AsyncDataService (returns non-Data)
// is still accepted — createLazy gates on schema-match alone, not IsValid.
interface NonConformantService extends Service {
  fetch: (id: string) => Promise<Response>;      // Response ∉ Data → not IsValid
  count: Observe<number | undefined>;            // undefined-in-Observe → not IsValid
}
// The service genuinely fails IsValid...
// @ts-expect-error - NonConformantService returns non-Data / undefined-in-Observe
type _NonConformantFailsIsValid = Assert<IsValid<NonConformantService>>;
// ...yet createLazy accepts it because the schema correctly describes the members.
const validNonConformant = createLazy({
  load: () => Promise.resolve({} as NonConformantService),
  schema: {
    type: "object",
    properties: {
      fetch: { type: "function", signature: { parameters: [{ name: "arg0", schema: {} }], returns: { type: "promise", value: {} } } },
      count: { type: "observe", value: {} }
    },
    required: ["fetch", "count"],
    additionalProperties: false
  }
});

// ============================================================================
// ERROR TESTS (These should produce TypeScript errors)
// ============================================================================

// ❌ Test 5: Missing property 'refreshToken'
const errorMissing = createLazy({
  load: () => Promise.resolve({} as SimpleAuthService),
  // @ts-expect-error - Missing property 'refreshToken' in schema
  schema: {
    type: "object",
    properties: {
      isSignedIn: { type: "observe", value: {} },
      accessToken: { type: "observe", value: {} },
      userProfile: { type: "observe", value: {} },
      showSignInDialog: { type: "function", signature: { parameters: [] } },
      hideSignInDialog: { type: "function", signature: { parameters: [] } },
      // Missing: refreshToken
      signIn: { type: "function", signature: { parameters: [{ name: "arg0", schema: {} }], returns: { type: "promise", value: {} } } },
      signOut: { type: "function", signature: { parameters: [], returns: { type: "promise", value: {} } } }
    },
    required: ["isSignedIn", "accessToken", "userProfile", "showSignInDialog", "hideSignInDialog", "signIn", "signOut"],
    additionalProperties: false
  }
});

// ❌ Test 6: Wrong schema type (observe property described as an observe function)
const errorWrongType1 = createLazy({
  load: () => Promise.resolve({} as SimpleAuthService),
  // @ts-expect-error - Wrong schema type for isSignedIn (function instead of observe)
  schema: {
    type: "object",
    properties: {
      isSignedIn: { type: "function", signature: { parameters: [], returns: { type: "observe", value: {} } } }, // WRONG: should be observe
      accessToken: { type: "observe", value: {} },
      userProfile: { type: "observe", value: {} },
      showSignInDialog: { type: "function", signature: { parameters: [] } },
      hideSignInDialog: { type: "function", signature: { parameters: [] } },
      refreshToken: { type: "function", signature: { parameters: [], returns: { type: "promise", value: {} } } },
      signIn: { type: "function", signature: { parameters: [{ name: "arg0", schema: {} }], returns: { type: "promise", value: {} } } },
      signOut: { type: "function", signature: { parameters: [], returns: { type: "promise", value: {} } } }
    },
    required: ["isSignedIn", "accessToken", "userProfile", "showSignInDialog", "hideSignInDialog", "refreshToken", "signIn", "signOut"],
    additionalProperties: false
  }
});

// ❌ Test 7: Wrong schema type (void function described as promise function)
const errorWrongType2 = createLazy({
  load: () => Promise.resolve({} as SimpleAuthService),
  // @ts-expect-error - Wrong schema type for showSignInDialog (promise instead of void)
  schema: {
    type: "object",
    properties: {
      isSignedIn: { type: "observe", value: {} },
      accessToken: { type: "observe", value: {} },
      userProfile: { type: "observe", value: {} },
      showSignInDialog: { type: "function", signature: { parameters: [], returns: { type: "promise", value: {} } } }, // WRONG: should be void
      hideSignInDialog: { type: "function", signature: { parameters: [] } },
      refreshToken: { type: "function", signature: { parameters: [], returns: { type: "promise", value: {} } } },
      signIn: { type: "function", signature: { parameters: [{ name: "arg0", schema: {} }], returns: { type: "promise", value: {} } } },
      signOut: { type: "function", signature: { parameters: [], returns: { type: "promise", value: {} } } }
    },
    required: ["isSignedIn", "accessToken", "userProfile", "showSignInDialog", "hideSignInDialog", "refreshToken", "signIn", "signOut"],
    additionalProperties: false
  }
});

// ❌ Test 8: Extra property that doesn't exist in service
const errorExtra = createLazy({
  load: () => Promise.resolve({} as ServiceWithObserveFn),
  // @ts-expect-error - Extra property 'unknownProperty' not in service
  schema: {
    type: "object",
    properties: {
      allUsers: { type: "observe", value: {} },
      selectUser: { type: "function", signature: { parameters: [{ name: "arg0", schema: {} }], returns: { type: "observe", value: {} } } },
      fetchData: { type: "function", signature: { parameters: [], returns: { type: "promise", value: {} } } },
      unknownProperty: { type: "observe", value: {} } // EXTRA: doesn't exist in service
    },
    required: ["allUsers", "selectUser", "fetchData", "unknownProperty"],
    additionalProperties: false
  }
});

// ❌ Test 9: Wrong schema for observe function (described as observe property)
const errorObserveFn = createLazy({
  load: () => Promise.resolve({} as ServiceWithObserveFn),
  // @ts-expect-error - Wrong schema type for selectUser (observe instead of observe function)
  schema: {
    type: "object",
    properties: {
      allUsers: { type: "observe", value: {} },
      selectUser: { type: "observe", value: {} }, // WRONG: should be a function returning observe
      fetchData: { type: "function", signature: { parameters: [], returns: { type: "promise", value: {} } } }
    },
    required: ["allUsers", "selectUser", "fetchData"],
    additionalProperties: false
  }
});

// ❌ Test 10: Wrong schema for generator (described as promise function)
const errorGenerator = createLazy({
  load: () => Promise.resolve({} as ServiceWithGenerator),
  // @ts-expect-error - Wrong schema type for streamEvents (promise instead of generator)
  schema: {
    type: "object",
    properties: {
      status: { type: "observe", value: {} },
      streamEvents: { type: "function", signature: { parameters: [], returns: { type: "promise", value: {} } } }, // WRONG: should be generator
      cancel: { type: "function", signature: { parameters: [] } }
    },
    required: ["status", "streamEvents", "cancel"],
    additionalProperties: false
  }
});

// ✅ Test 11: A nested organizational object member is wrapped recursively.
interface ServiceWithNestedGroup extends Service {
  group: { readonly ready: Observe<boolean> };
}
type _CheckNestedGroupIsValid = Assert<IsValid<ServiceWithNestedGroup>>;
const nestedObject = createLazy({
  load: () => Promise.resolve({} as ServiceWithNestedGroup),
  schema: {
    type: "object",
    properties: {
      group: { type: "object", properties: { ready: { type: "observe", value: { type: "boolean" } } }, required: ["ready"], additionalProperties: false },
    },
    required: ["group"],
    additionalProperties: false
  }
});

// ❌ Test 12: A function member whose `returns` carries no recognized type would
// resolve to `any` (vacuously passing the gate) but has no runtime wrapper — so it
// is rejected at compile time by the member-kind constraint.
const errorMalformedReturns = createLazy({
  load: () => Promise.resolve({} as ServiceWithObserveFn),
  schema: {
    type: "object",
    properties: {
      allUsers: { type: "observe", value: {} },
      selectUser: { type: "function", signature: { parameters: [{ name: "arg0", schema: {} }], returns: { type: "observe", value: {} } } },
      // @ts-expect-error - `returns` has no recognized type-constructor
      fetchData: { type: "function", signature: { parameters: [], returns: { value: {} } } },
    },
    required: ["allUsers", "selectUser", "fetchData"],
    additionalProperties: false
  }
});

// ============================================================================
// RUNTIME TESTS
// ============================================================================

describe('createLazy', () => {
  test('lazy instance exposes its schema before load', async () => {
    interface TestService extends Service {
      value: Observe<string>;
    }

    let loaded = false;
    const schema = {
      type: "object",
      properties: { value: { type: "observe", value: {} } },
      required: ["value"],
      additionalProperties: false
    } as const;

    const factory = createLazy({
      load: (): Promise<TestService> => {
        loaded = true;
        return Promise.resolve({ serviceName: 'test-service', value: (n) => { n('x'); return () => {}; } });
      },
      schema
    });

    const service = factory();

    // The schema slot is Observe<Schema>; subscribing emits the constant synchronously.
    let observed: unknown;
    service.schema?.((s) => { observed = s; });

    assert({
      given: 'a lazy service is created',
      should: 'expose its schema as a constant observable without triggering a load',
      actual: `${observed === schema},${loaded}`,
      expected: 'true,false'
    });
  });

  test('factory pattern', async () => {
    interface TestService extends Service {
      value: Observe<string>;
    }

    const createTestService = (): Promise<TestService> => {
      return Promise.resolve({
        serviceName: 'test-service',
        value: (notify) => {
          notify('test-value');
          return () => {};
        }
      });
    };

    const factory = createLazy({
      load: createTestService,
      schema: {
        type: "object",
        properties: { value: { type: "observe", value: {} } },
        required: ["value"],
        additionalProperties: false
      }
    });

    assert({
      given: 'createLazy is called',
      should: 'return a factory function',
      actual: typeof factory,
      expected: 'function'
    });

    const service = factory();

    assert({
      given: 'factory function is called',
      should: 'return a service with serviceName',
      actual: typeof service.serviceName,
      expected: 'string'
    });
  });

  test('observe property', async () => {
    interface TestService extends Service {
      value: Observe<string>;
    }

    const createTestService = (): Promise<TestService> => {
      return Promise.resolve({
        serviceName: 'test-service',
        value: (notify) => {
          notify('test-value');
          return () => {};
        }
      });
    };

    const factory = createLazy({
      load: createTestService,
      schema: {
        type: "object",
        properties: { value: { type: "observe", value: {} } },
        required: ["value"],
        additionalProperties: false
      }
    });

    const service = factory();

    let receivedValue: string | null = null;
    const unobserve = service.value((value) => {
      receivedValue = value;
    });

    // Wait for async load
    await new Promise(resolve => setTimeout(resolve, 10));

    assert({
      given: 'observe property is subscribed',
      should: 'receive value from real service after load',
      actual: receivedValue,
      expected: 'test-value'
    });

    unobserve();
  });

  test('observe property returns same instance', async () => {
    interface TestService extends Service {
      value: Observe<string>;
    }

    const createTestService = (): Promise<TestService> => {
      return Promise.resolve({
        serviceName: 'test-service',
        value: (notify) => {
          notify('test-value');
          return () => {};
        }
      });
    };

    const factory = createLazy({
      load: createTestService,
      schema: {
        type: "object",
        properties: { value: { type: "observe", value: {} } },
        required: ["value"],
        additionalProperties: false
      }
    });

    const service = factory();

    const observe1 = service.value;
    const observe2 = service.value;

    assert({
      given: 'observe property is accessed multiple times',
      should: 'return the same Observe instance',
      actual: observe1 === observe2,
      expected: true
    });
  });

  test('promise function', async () => {
    interface TestService extends Service {
      fetchData: (id: string) => Promise<{ readonly value: string }>;
    }

    const createTestService = (): Promise<TestService> => {
      return Promise.resolve({
        serviceName: 'test-service',
        fetchData: async (id: string) => {
          return { value: `data-${id}` };
        }
      });
    };

    const factory = createLazy({
      load: createTestService,
      schema: {
        type: "object",
        properties: { fetchData: { type: "function", signature: { parameters: [{ name: "arg0", schema: {} }], returns: { type: "promise", value: {} } } } },
        required: ["fetchData"],
        additionalProperties: false
      }
    });

    const service = factory();

    const result = await service.fetchData('123');

    assert({
      given: 'promise function is called',
      should: 'return result from real service',
      actual: result.value,
      expected: 'data-123'
    });
  });

  test('promise function queuing', async () => {
    interface TestService extends Service {
      fetchData: (id: string) => Promise<string>;
    }

    const calls: string[] = [];

    const createTestService = (): Promise<TestService> => {
      return new Promise(resolve => {
        setTimeout(() => {
          resolve({
            serviceName: 'test-service',
            fetchData: async (id: string) => {
              calls.push(id);
              return `result-${id}`;
            }
          });
        }, 50);
      });
    };

    const factory = createLazy({
      load: createTestService,
      schema: {
        type: "object",
        properties: { fetchData: { type: "function", signature: { parameters: [{ name: "arg0", schema: {} }], returns: { type: "promise", value: {} } } } },
        required: ["fetchData"],
        additionalProperties: false
      }
    });

    const service = factory();

    // Call multiple times before service loads
    const p1 = service.fetchData('a');
    const p2 = service.fetchData('b');
    const p3 = service.fetchData('c');

    const results = await Promise.all([p1, p2, p3]);

    assert({
      given: 'multiple calls made before service loads',
      should: 'execute all calls in order',
      actual: calls.join(','),
      expected: 'a,b,c'
    });

    assert({
      given: 'queued calls complete',
      should: 'return correct results',
      actual: results.join(','),
      expected: 'result-a,result-b,result-c'
    });
  });

  test('promise function second and later calls after first completes', async () => {
    interface TestService extends Service {
      fetchData: (id: string) => Promise<string>;
    }

    const createTestService = (): Promise<TestService> =>
      Promise.resolve({
        serviceName: 'test-service',
        fetchData: async (id: string) => `result-${id}`
      });

    const factory = createLazy({
      load: createTestService,
      schema: {
        type: "object",
        properties: { fetchData: { type: "function", signature: { parameters: [{ name: "arg0", schema: {} }], returns: { type: "promise", value: {} } } } },
        required: ["fetchData"],
        additionalProperties: false
      }
    });

    const service = factory();

    const first = await service.fetchData('first');
    assert({
      given: 'first call to fn:promise method',
      should: 'resolve',
      actual: first,
      expected: 'result-first'
    });

    const second = await service.fetchData('second');
    assert({
      given: 'second call after first completed',
      should: 'resolve (regression: isProcessing was never reset)',
      actual: second,
      expected: 'result-second'
    });

    const third = await service.fetchData('third');
    assert({
      given: 'third call after second completed',
      should: 'resolve',
      actual: third,
      expected: 'result-third'
    });
  });

  test('promise function returns same instance', async () => {
    interface TestService extends Service {
      fetchData: (id: string) => Promise<string>;
    }

    const factory = createLazy({
      load: () => Promise.resolve({
        serviceName: 'test-service',
        fetchData: async (id: string) => `result-${id}`
      }),
      schema: {
        type: "object",
        properties: { fetchData: { type: "function", signature: { parameters: [{ name: "arg0", schema: {} }], returns: { type: "promise", value: {} } } } },
        required: ["fetchData"],
        additionalProperties: false
      }
    });

    const service = factory();

    const fn1 = service.fetchData;
    const fn2 = service.fetchData;

    assert({
      given: 'promise function property is accessed multiple times',
      should: 'return the same function instance',
      actual: fn1 === fn2,
      expected: true
    });
  });

  test('promise function calls return different promises', async () => {
    interface TestService extends Service {
      fetchData: (id: string) => Promise<string>;
    }

    const factory = createLazy({
      load: () => Promise.resolve({
        serviceName: 'test-service',
        fetchData: async (id: string) => `result-${id}`
      }),
      schema: {
        type: "object",
        properties: { fetchData: { type: "function", signature: { parameters: [{ name: "arg0", schema: {} }], returns: { type: "promise", value: {} } } } },
        required: ["fetchData"],
        additionalProperties: false
      }
    });

    const service = factory();

    const promise1 = service.fetchData('id-1');
    const promise2 = service.fetchData('id-1');
    const promise3 = service.fetchData('id-2');

    assert({
      given: 'promise function is called multiple times',
      should: 'return different Promise instances',
      actual: promise1 !== promise2 && promise1 !== promise3,
      expected: true
    });

    const results = await Promise.all([promise1, promise2, promise3]);

    assert({
      given: 'promise function called with different args',
      should: 'resolve to correct values independently',
      actual: results.join(','),
      expected: 'result-id-1,result-id-1,result-id-2'
    });
  });

  test('void function', async () => {
    interface TestService extends Service {
      track: (event: string) => void;
    }

    const events: string[] = [];

    const createTestService = (): Promise<TestService> => {
      return Promise.resolve({
        serviceName: 'test-service',
        track: (event: string) => {
          events.push(event);
        }
      });
    };

    const factory = createLazy({
      load: createTestService,
      schema: {
        type: "object",
        properties: { track: { type: "function", signature: { parameters: [{ name: "arg0", schema: {} }] } } },
        required: ["track"],
        additionalProperties: false
      }
    });

    const service = factory();

    service.track('event-1');
    service.track('event-2');

    // Wait for async load and execution
    await new Promise(resolve => setTimeout(resolve, 10));

    assert({
      given: 'void functions are called',
      should: 'execute all calls in order after load',
      actual: events.join(','),
      expected: 'event-1,event-2'
    });
  });

  test('observe function', async () => {
    interface TestService extends Service {
      selectUser: (id: string) => Observe<string>;
    }

    const createTestService = (): Promise<TestService> => {
      return Promise.resolve({
        serviceName: 'test-service',
        selectUser: (id: string) => (notify) => {
          notify(`user-${id}`);
          return () => {};
        }
      });
    };

    const factory = createLazy({
      load: createTestService,
      schema: {
        type: "object",
        properties: { selectUser: { type: "function", signature: { parameters: [{ name: "arg0", schema: {} }], returns: { type: "observe", value: {} } } } },
        required: ["selectUser"],
        additionalProperties: false
      }
    });

    const service = factory();

    let receivedValue: string | null = null;
    const observe = service.selectUser('123');
    const unobserve = observe((value) => {
      receivedValue = value;
    });

    // Wait for async load
    await new Promise(resolve => setTimeout(resolve, 10));

    assert({
      given: 'observe function is called and subscribed',
      should: 'receive value from real service',
      actual: receivedValue,
      expected: 'user-123'
    });

    unobserve();
  });

  test('observe function returns same instance', async () => {
    interface TestService extends Service {
      selectUser: (id: string) => Observe<string>;
    }

    const factory = createLazy({
      load: () => Promise.resolve({
        serviceName: 'test-service',
        selectUser: (id: string) => (notify: (value: string) => void) => {
          notify(`user-${id}`);
          return () => {};
        }
      }),
      schema: {
        type: "object",
        properties: { selectUser: { type: "function", signature: { parameters: [{ name: "arg0", schema: {} }], returns: { type: "observe", value: {} } } } },
        required: ["selectUser"],
        additionalProperties: false
      }
    });

    const service = factory();

    const fn1 = service.selectUser;
    const fn2 = service.selectUser;

    assert({
      given: 'observe function property is accessed multiple times',
      should: 'return the same function instance',
      actual: fn1 === fn2,
      expected: true
    });
  });

  test('observe function calls return different instances', async () => {
    interface TestService extends Service {
      selectUser: (id: string) => Observe<string>;
    }

    const factory = createLazy({
      load: () => Promise.resolve({
        serviceName: 'test-service',
        selectUser: (id: string) => (notify: (value: string) => void) => {
          notify(`user-${id}`);
          return () => {};
        }
      }),
      schema: {
        type: "object",
        properties: { selectUser: { type: "function", signature: { parameters: [{ name: "arg0", schema: {} }], returns: { type: "observe", value: {} } } } },
        required: ["selectUser"],
        additionalProperties: false
      }
    });

    const service = factory();

    const observe1 = service.selectUser('id-1');
    const observe2 = service.selectUser('id-1');
    const observe3 = service.selectUser('id-2');

    assert({
      given: 'observe function is called multiple times with same args',
      should: 'return different Observe instances',
      actual: observe1 !== observe2,
      expected: true
    });

    assert({
      given: 'observe function is called with different args',
      should: 'return different Observe instances',
      actual: observe1 !== observe3,
      expected: true
    });
  });

  test('observe function calls with different args work independently', async () => {
    interface TestService extends Service {
      selectUser: (id: string) => Observe<string>;
    }

    const factory = createLazy({
      load: () => Promise.resolve({
        serviceName: 'test-service',
        selectUser: (id: string) => (notify: (value: string) => void) => {
          notify(`user-${id}`);
          return () => {};
        }
      }),
      schema: {
        type: "object",
        properties: { selectUser: { type: "function", signature: { parameters: [{ name: "arg0", schema: {} }], returns: { type: "observe", value: {} } } } },
        required: ["selectUser"],
        additionalProperties: false
      }
    });

    const service = factory();

    const values: string[] = [];

    const observe1 = service.selectUser('id-1');
    const unobserve1 = observe1((value) => values.push(`obs1:${value}`));

    const observe2 = service.selectUser('id-2');
    const unobserve2 = observe2((value) => values.push(`obs2:${value}`));

    // Wait for async load
    await new Promise(resolve => setTimeout(resolve, 10));

    assert({
      given: 'multiple observe function calls with different args',
      should: 'each receive their own values independently',
      actual: values.sort().join(','),
      expected: 'obs1:user-id-1,obs2:user-id-2'
    });

    unobserve1();
    unobserve2();
  });

  test('generator function', async () => {
    interface TestService extends Service {
      streamData: () => AsyncGenerator<number>;
    }

    const createTestService = (): Promise<TestService> => {
      return Promise.resolve({
        serviceName: 'test-service',
        streamData: async function* () {
          yield 1;
          yield 2;
          yield 3;
        }
      });
    };

    const factory = createLazy({
      load: createTestService,
      schema: {
        type: "object",
        properties: { streamData: { type: "function", signature: { parameters: [], returns: { type: "generator", value: {} } } } },
        required: ["streamData"],
        additionalProperties: false
      }
    });

    const service = factory();

    const values: number[] = [];
    for await (const value of service.streamData()) {
      values.push(value);
    }

    assert({
      given: 'generator function is called',
      should: 'yield all values from real service',
      actual: values.join(','),
      expected: '1,2,3'
    });
  });

  test('generator return() before next() latches done (no resurrection)', async () => {
    interface TestService extends Service {
      streamData: () => AsyncGenerator<number>;
    }

    let started = false;
    const factory = createLazy({
      load: () => Promise.resolve({
        serviceName: 'test-service',
        streamData: async function* () {
          started = true;
          yield 1;
          yield 2;
        }
      }),
      schema: {
        type: "object",
        properties: { streamData: { type: "function", signature: { parameters: [], returns: { type: "generator", value: {} } } } },
        required: ["streamData"],
        additionalProperties: false
      }
    });

    const gen = factory().streamData();
    const returned = await gen.return(undefined);
    const afterReturn = await gen.next();

    assert({
      given: 'return() is called before the first next()',
      should: 'report done and never start the real generator',
      actual: `${returned.done},${afterReturn.done},${started}`,
      expected: 'true,true,false'
    });
  });

  test('generator supports async dispose', async () => {
    interface TestService extends Service {
      streamData: () => AsyncGenerator<number>;
    }

    const factory = createLazy({
      load: () => Promise.resolve({
        serviceName: 'test-service',
        streamData: async function* () {
          yield 1;
          yield 2;
        }
      }),
      schema: {
        type: "object",
        properties: { streamData: { type: "function", signature: { parameters: [], returns: { type: "generator", value: {} } } } },
        required: ["streamData"],
        additionalProperties: false
      }
    });

    const gen = factory().streamData();
    const hasDispose = typeof (gen as unknown as { [Symbol.asyncDispose]?: () => Promise<void> })[Symbol.asyncDispose];
    await (gen as unknown as { [Symbol.asyncDispose](): Promise<void> })[Symbol.asyncDispose]();
    const afterDispose = await gen.next();

    assert({
      given: 'a lazy generator is async-disposed',
      should: 'expose Symbol.asyncDispose and be done afterward',
      actual: `${hasDispose},${afterDispose.done}`,
      expected: 'function,true'
    });
  });

  test('generator function returns same instance', async () => {
    interface TestService extends Service {
      streamData: () => AsyncGenerator<number>;
    }

    const factory = createLazy({
      load: () => Promise.resolve({
        serviceName: 'test-service',
        streamData: async function* () {
          yield 1;
          yield 2;
        }
      }),
      schema: {
        type: "object",
        properties: { streamData: { type: "function", signature: { parameters: [], returns: { type: "generator", value: {} } } } },
        required: ["streamData"],
        additionalProperties: false
      }
    });

    const service = factory();

    const fn1 = service.streamData;
    const fn2 = service.streamData;

    assert({
      given: 'generator function property is accessed multiple times',
      should: 'return the same function instance',
      actual: fn1 === fn2,
      expected: true
    });
  });

  test('generator function calls return different generators', async () => {
    interface TestService extends Service {
      streamData: (prefix: string) => AsyncGenerator<string>;
    }

    const factory = createLazy({
      load: () => Promise.resolve({
        serviceName: 'test-service',
        streamData: async function* (prefix: string) {
          yield `${prefix}-1`;
          yield `${prefix}-2`;
        }
      }),
      schema: {
        type: "object",
        properties: { streamData: { type: "function", signature: { parameters: [{ name: "arg0", schema: {} }], returns: { type: "generator", value: {} } } } },
        required: ["streamData"],
        additionalProperties: false
      }
    });

    const service = factory();

    const gen1 = service.streamData('A');
    const gen2 = service.streamData('B');

    assert({
      given: 'generator function is called multiple times',
      should: 'return different AsyncGenerator instances',
      actual: gen1 !== gen2,
      expected: true
    });

    const values1: string[] = [];
    const values2: string[] = [];

    for await (const value of gen1) {
      values1.push(value);
    }

    for await (const value of gen2) {
      values2.push(value);
    }

    assert({
      given: 'different generator instances with different args',
      should: 'produce independent sequences',
      actual: `${values1.join(',')}|${values2.join(',')}`,
      expected: 'A-1,A-2|B-1,B-2'
    });
  });

  test('void function returns same instance', async () => {
    interface TestService extends Service {
      track: (event: string) => void;
    }

    const factory = createLazy({
      load: () => Promise.resolve({
        serviceName: 'test-service',
        track: (event: string) => {}
      }),
      schema: {
        type: "object",
        properties: { track: { type: "function", signature: { parameters: [{ name: "arg0", schema: {} }] } } },
        required: ["track"],
        additionalProperties: false
      }
    });

    const service = factory();

    const fn1 = service.track;
    const fn2 = service.track;

    assert({
      given: 'void function property is accessed multiple times',
      should: 'return the same function instance',
      actual: fn1 === fn2,
      expected: true
    });
  });
});

// ============================================================================
// PRELOAD OPTION TESTS
// ============================================================================

describe('createLazy preload option', () => {
  interface TestService extends Service {
    track: (event: string) => void;
  }

  const makeLoader = (loadCount: { value: number }) => (): Promise<TestService> => {
    loadCount.value += 1;
    return Promise.resolve({
      serviceName: 'test-service',
      track: (_event: string) => {}
    });
  };

  // Stubs requestIdleCallback (absent in the Node test environment) so preload can run.
  const withIdleCallback = async (run: () => Promise<void>): Promise<void> => {
    const g = globalThis as { requestIdleCallback?: (callback: () => void) => void };
    const original = g.requestIdleCallback;
    g.requestIdleCallback = (callback) => { callback(); };
    try {
      await run();
    } finally {
      g.requestIdleCallback = original;
    }
  };

  const trackSchema = {
    type: "object",
    properties: { track: { type: "function", signature: { parameters: [{ name: "arg0", schema: {} }] } } },
    required: ["track"],
    additionalProperties: false
  } as const;

  test('does not load when preload is not set', async () => {
    const loadCount = { value: 0 };
    const factory = createLazy({ load: makeLoader(loadCount), schema: trackSchema });

    factory();
    await new Promise(resolve => setTimeout(resolve, 10));

    assert({
      given: 'a factory instance created without preload',
      should: 'not load the real service until a property is touched',
      actual: loadCount.value,
      expected: 0
    });
  });

  test('preload: true warms the service before any property touch', async () => {
    await withIdleCallback(async () => {
      const loadCount = { value: 0 };
      const factory = createLazy({ load: makeLoader(loadCount), schema: trackSchema, preload: true });

      factory();
      await new Promise(resolve => setTimeout(resolve, 10));

      assert({
        given: 'preload: true with an idle callback available',
        should: 'load the real service without any property being touched',
        actual: loadCount.value,
        expected: 1
      });
    });
  });

  test('preload: true dedupes with the first real property access', async () => {
    await withIdleCallback(async () => {
      const loadCount = { value: 0 };
      const factory = createLazy({ load: makeLoader(loadCount), schema: trackSchema, preload: true });

      const service = factory();
      service.track('event-1');
      await new Promise(resolve => setTimeout(resolve, 10));

      assert({
        given: 'preload plus a real property touch',
        should: 'load the real service exactly once',
        actual: loadCount.value,
        expected: 1
      });
    });
  });
});

// ============================================================================
// NESTED GROUPS AND PARTIAL SCHEMAS
// ============================================================================

// A service with nested organizational groups at two depths.
interface NestedService extends Service {
  root: Observe<number>;
  actions: {
    bump: () => void;
    add: (a: number, b: number) => Promise<number>;
    deep: {
      label: (prefix: string) => Observe<string>;
      count: (to: number) => AsyncGenerator<number>;
    };
  };
}

const nestedSchema = {
  type: "object",
  properties: {
    root: { type: "observe", value: { type: "number" } },
    actions: {
      type: "object",
      properties: {
        bump: { type: "function" },
        add: { type: "function", signature: { parameters: [{ name: "a", schema: { type: "number" } }, { name: "b", schema: { type: "number" } }], returns: { type: "promise", value: { type: "number" } } } },
        deep: {
          type: "object",
          properties: {
            label: { type: "function", signature: { parameters: [{ name: "prefix", schema: { type: "string" } }], returns: { type: "observe", value: { type: "string" } } } },
            count: { type: "function", signature: { parameters: [{ name: "to", schema: { type: "number" } }], returns: { type: "generator", value: { type: "number" } } } },
          },
          required: ["label", "count"],
          additionalProperties: false,
        },
      },
      required: ["bump", "add", "deep"],
      additionalProperties: false,
    },
  },
  required: ["root", "actions"],
  additionalProperties: false,
} as const;

const createNested = (log: string[]) => {
  const [root, setRoot] = Observe.createState(0);
  let value = 0;
  const service: NestedService = {
    serviceName: 'nested',
    root,
    actions: {
      bump: () => { log.push('bump'); setRoot(++value); },
      add: async (a, b) => { log.push('add'); return a + b; },
      deep: {
        label: (prefix) => Observe.withMap(root, n => `${prefix}${n}`),
        count: async function* (to) { log.push('count'); for (let i = 1; i <= to; i++) yield i; },
      },
    },
  };
  return service;
};

describe('createLazy nested groups', () => {
  test('wraps nested groups at any depth without loading until first use', async () => {
    const log: string[] = [];
    let loads = 0;
    const factory = createLazy({
      load: async (): Promise<NestedService> => { loads++; return createNested(log); },
      schema: nestedSchema,
    });
    const service = factory();
    const loadsBefore = loads;

    const labels: string[] = [];
    const unobserve = service.actions.deep.label('n=')(label => labels.push(label));
    service.actions.bump();
    const sum = await service.actions.add(2, 3);
    const counted: number[] = [];
    for await (const n of service.actions.deep.count(3)) counted.push(n);
    unobserve();

    assert({
      given: 'a lazy service whose schema has nested groups',
      should: 'not load before use, then forward every nested member kind to the loaded service once',
      actual: { loadsBefore, loads, sum, counted, labels, log },
      expected: { loadsBefore: 0, loads: 1, sum: 5, counted: [1, 2, 3], labels: ['n=0', 'n=1'], log: ['bump', 'add', 'count'] },
    });
  });

  test('keeps call order across members at different depths', async () => {
    const order: string[] = [];
    const factory = createLazy({
      load: async (): Promise<NestedService> => {
        const service = createNested([]);
        return { ...service, root: notify => { order.push('subscribe root'); return service.root(notify); }, actions: { ...service.actions, bump: () => order.push('bump') } };
      },
      schema: nestedSchema,
    });
    const service = factory();
    const unobserve = service.root(() => {});
    service.actions.bump();
    await new Promise(resolve => setTimeout(resolve, 0));
    unobserve();

    assert({
      given: 'a top-level subscription then a nested call made before load',
      should: 'run them in the order they were made',
      actual: order,
      expected: ['subscribe root', 'bump'],
    });
  });
});

describe('createLazy partial', () => {
  const partialSchema = {
    type: "object",
    description: "Only the bump action of the nested service.",
    properties: {
      actions: { type: "object", properties: { bump: { type: "function" } }, required: ["bump"], additionalProperties: false },
    },
    required: ["actions"],
    additionalProperties: false,
  } as const;

  test('exposes only the described subset of a larger service', async () => {
    const log: string[] = [];
    const factory = createLazy({ load: async (): Promise<NestedService> => createNested(log), schema: partialSchema, partial: true });
    const service = factory();
    service.actions.bump();
    await new Promise(resolve => setTimeout(resolve, 0));

    assert({
      given: 'a partial schema describing one nested member of a larger service',
      should: 'carry only the described members and forward them',
      actual: { keys: Object.keys(service).sort(), actionKeys: Object.keys(service.actions), log },
      expected: { keys: ['actions', 'schema', 'serviceName'], actionKeys: ['bump'], log: ['bump'] },
    });
  });
});

// ============================================================================
// TYPE TESTS: nested groups and the partial gate
// ============================================================================

const _nestedComplete = () => createLazy({ load: async (): Promise<NestedService> => createNested([]), schema: nestedSchema });
type _NestedInstanceIsService = Assert<ReturnType<ReturnType<typeof _nestedComplete>> extends NestedService ? true : false>;

const _partialInstance = () => createLazy({
  load: async (): Promise<NestedService> => createNested([]),
  schema: { type: "object", properties: { actions: { type: "object", properties: { bump: { type: "function" } }, required: ["bump"], additionalProperties: false } }, required: ["actions"], additionalProperties: false },
  partial: true,
})();
// A partial instance is typed as the schema, not the whole service: `root` is not reachable.
type _PartialHasBump = Assert<ReturnType<typeof _partialInstance>['actions']['bump'] extends () => void ? true : false>;
type _PartialHidesRoot = Assert<'root' extends keyof ReturnType<typeof _partialInstance> ? false : true>;

// Without `partial`, a subset schema is rejected.
// @ts-expect-error -- a schema describing a subset of the service needs `partial: true`
createLazy({ load: async (): Promise<NestedService> => createNested([]), schema: { type: "object", properties: { root: { type: "observe", value: { type: "number" } } }, required: ["root"], additionalProperties: false } });

// With `partial`, a described member whose type disagrees with the service is rejected.
createLazy({
  load: async (): Promise<NestedService> => createNested([]),
  // @ts-expect-error -- `root` is an Observe<number> on the service, not Observe<string>
  schema: { type: "object", properties: { root: { type: "observe", value: { type: "string" } } }, required: ["root"], additionalProperties: false },
  partial: true,
});

// With `partial`, a member the service does not have is rejected.
createLazy({
  load: async (): Promise<NestedService> => createNested([]),
  // @ts-expect-error -- the service has no `missing` member
  schema: { type: "object", properties: { missing: { type: "function" } }, required: ["missing"], additionalProperties: false },
  partial: true,
});
