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
// VALID USAGE TESTS
// ============================================================================

// ✅ Test 1: Complete descriptor for SimpleAuthService
const validAuth = createLazy(
  () => Promise.resolve({} as SimpleAuthService),
  {
    isSignedIn: 'observe',
    accessToken: 'observe',
    userProfile: 'observe',
    showSignInDialog: 'fn:void',
    hideSignInDialog: 'fn:void',
    refreshToken: 'fn:promise',
    signIn: 'fn:promise',
    signOut: 'fn:promise'
  }
);

// ✅ Test 2: Service with function returning Observe
const validObserveFn = createLazy(
  () => Promise.resolve({} as ServiceWithObserveFn),
  {
    allUsers: 'observe',
    selectUser: 'fn:observe',
    fetchData: 'fn:promise'
  }
);

// ✅ Test 3: Service with AsyncGenerator
const validGenerator = createLazy(
  () => Promise.resolve({} as ServiceWithGenerator),
  {
    status: 'observe',
    streamEvents: 'fn:generator',
    cancel: 'fn:void'
  }
);

// ✅ Test 4: Service with constructor args
type ServiceConfig = {
  apiUrl: string;
  timeout?: number;
};

const validWithArgs = createLazy(
  (args: ServiceConfig) => {
    // args is properly typed as ServiceConfig
    console.log(args.apiUrl);
    return Promise.resolve({} as ConfigurableService);
  },
  {
    config: 'observe',
    fetch: 'fn:promise'
  }
);

// ============================================================================
// ERROR TESTS (These should produce TypeScript errors)
// ============================================================================

// ❌ Test 5: Missing property 'refreshToken'
const errorMissing = createLazy(
  () => Promise.resolve({} as SimpleAuthService),
  // @ts-expect-error - Missing property 'refreshToken' in descriptor
  {
    isSignedIn: 'observe',
    accessToken: 'observe',
    userProfile: 'observe',
    showSignInDialog: 'fn:void',
    hideSignInDialog: 'fn:void',
    // Missing: refreshToken
    signIn: 'fn:promise',
    signOut: 'fn:promise'
  }
);

// ❌ Test 6: Wrong descriptor type (observe property marked as fn:observe)
const errorWrongType1 = createLazy(
  () => Promise.resolve({} as SimpleAuthService),
  {
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
);

// ❌ Test 7: Wrong descriptor type (void function marked as fn:promise)
const errorWrongType2 = createLazy(
  () => Promise.resolve({} as SimpleAuthService),
  {
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
);

// ❌ Test 8: Extra property that doesn't exist in service
const errorExtra = createLazy(
  () => Promise.resolve({} as ServiceWithObserveFn),
  {
    allUsers: 'observe',
    selectUser: 'fn:observe',
    fetchData: 'fn:promise',
    // @ts-expect-error - Extra property
    unknownProperty: 'observe' // EXTRA: doesn't exist in service
  }
);

// ❌ Test 9: Wrong descriptor for fn:observe (marked as observe)
const errorObserveFn = createLazy(
  () => Promise.resolve({} as ServiceWithObserveFn),
  {
    allUsers: 'observe',
    // @ts-expect-error - Wrong descriptor type
    selectUser: 'observe', // WRONG: should be 'fn:observe'
    fetchData: 'fn:promise'
  }
);

// ❌ Test 10: Wrong descriptor for generator
const errorGenerator = createLazy(
  () => Promise.resolve({} as ServiceWithGenerator),
  {
    status: 'observe',
    // @ts-expect-error - Wrong descriptor type
    streamEvents: 'fn:promise', // WRONG: should be 'fn:generator'
    cancel: 'fn:void'
  }
);

// ============================================================================
// RUNTIME TESTS
// ============================================================================

describe('createLazy', () => {
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
    
    const factory = createLazy(
      createTestService,
      { value: 'observe' }
    );
    
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
    
    const factory = createLazy(
      createTestService,
      { value: 'observe' }
    );
    
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
    
    const factory = createLazy(
      createTestService,
      { value: 'observe' }
    );
    
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
    
    const factory = createLazy(
      createTestService,
      { fetchData: 'fn:promise' }
    );
    
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
    
    const factory = createLazy(
      createTestService,
      { fetchData: 'fn:promise' }
    );
    
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
  
  test('promise function returns same instance', async () => {
    interface TestService extends Service {
      fetchData: (id: string) => Promise<string>;
    }
    
    const factory = createLazy(
      () => Promise.resolve({
        serviceName: 'test-service',
        fetchData: async (id: string) => `result-${id}`
      }),
      { fetchData: 'fn:promise' }
    );
    
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
    
    const factory = createLazy(
      () => Promise.resolve({
        serviceName: 'test-service',
        fetchData: async (id: string) => `result-${id}`
      }),
      { fetchData: 'fn:promise' }
    );
    
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
    
    const factory = createLazy(
      createTestService,
      { track: 'fn:void' }
    );
    
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
    
    const factory = createLazy(
      createTestService,
      { selectUser: 'fn:observe' }
    );
    
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
    
    const factory = createLazy(
      () => Promise.resolve({
        serviceName: 'test-service',
        selectUser: (id: string) => (notify: (value: string) => void) => {
          notify(`user-${id}`);
          return () => {};
        }
      }),
      { selectUser: 'fn:observe' }
    );
    
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
    
    const factory = createLazy(
      () => Promise.resolve({
        serviceName: 'test-service',
        selectUser: (id: string) => (notify: (value: string) => void) => {
          notify(`user-${id}`);
          return () => {};
        }
      }),
      { selectUser: 'fn:observe' }
    );
    
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
    
    const factory = createLazy(
      () => Promise.resolve({
        serviceName: 'test-service',
        selectUser: (id: string) => (notify: (value: string) => void) => {
          notify(`user-${id}`);
          return () => {};
        }
      }),
      { selectUser: 'fn:observe' }
    );
    
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
    
    const factory = createLazy(
      createTestService,
      { streamData: 'fn:generator' }
    );
    
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
  
  test('generator function returns same instance', async () => {
    interface TestService extends Service {
      streamData: () => AsyncGenerator<number>;
    }
    
    const factory = createLazy(
      () => Promise.resolve({
        serviceName: 'test-service',
        streamData: async function* () {
          yield 1;
          yield 2;
        }
      }),
      { streamData: 'fn:generator' }
    );
    
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
    
    const factory = createLazy(
      () => Promise.resolve({
        serviceName: 'test-service',
        streamData: async function* (prefix: string) {
          yield `${prefix}-1`;
          yield `${prefix}-2`;
        }
      }),
      { streamData: 'fn:generator' }
    );
    
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
    
    const factory = createLazy(
      () => Promise.resolve({
        serviceName: 'test-service',
        track: (event: string) => {}
      }),
      { track: 'fn:void' }
    );
    
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
