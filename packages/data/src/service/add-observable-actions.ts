// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Service } from './service.js';
import { isService } from "./is-service.js";
import { Observe } from '../observe/index.js';
import { EquivalentTypes, Expand, IsVoid, NoNever, True } from '../types/index.js';
import { isPromise } from '../internal/promise/is-promise.js';

const NESTED_SERVICE_SEPARATOR = '_';

// Type that extends a Service with an observable actions property
export type WithObservableActions<T extends Service> = T & { actions: Observe<ServiceActionMessages<T>> };

/**
 * Returns true if this function return value is from an action function.
 * Action functions are only allowed to return void, BUT some action function implementations
 * may be async and return a Promise<void>. This is convenient for authoring and since
 * no other service functions are allowed to return Promises then we will assume this is an action.
 */
function isActionReturnValue(result: unknown) {
  return result === undefined || isPromise(result);
}

/**
 * Intercepts actions on a service and notifies via a callback.
 *
 * This function creates a proxy around the given service object. It intercepts
 * action calls and sends back action messages after each call.
 * It also wraps any child services within their own namespaced interceptActions Proxy.
 *
 * @template T - The type of the service object.
 * @param {T} service - The service object to be proxied.
 * @param {string} prefix - A prefix to be added to action names for nested services.
 * @param {(...args: unknown[]) => void} callback - A callback function to be called after an action is executed.
 * @returns {T} - The proxied service object.
 */
function interceptActions<T extends object>(service: T, prefix: string, callback: (...args: unknown[]) => void): T {
  const propertyCache = new Map<string | symbol, unknown>();
  const serviceCache = new Map<string | symbol, Service>();

  return new Proxy(service, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      const cached = propertyCache.get(prop);
      if (cached) {
        return cached;
      }
      let returnValue: unknown = value;
      if (typeof prop === 'string') {
        if (typeof value === 'function') {
          returnValue = (...args: unknown[]) => {
            // Call the original function with the same arguments
            // the binding to the target as `this` shouldn't be necessary but
            // we'll add it out of an abundance of caution.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- calling with same args.
            const result = (value as any).call(target, ...args);
            const executeCallback = () => {
              // this is an action, as actions always return void.
              callback({ action: prefix + prop, args });
            };

            // Notify via callback if the function returns void
            if (isActionReturnValue(result)) {
              if (isPromise(result)) {
                result.finally(executeCallback);
              } else {
                executeCallback();
              }
            }

            return result;
          };
        } else if (isService(value)) {
          // Wrap nested services in the same way
          const cachedService = serviceCache.get(prop);
          if (cachedService) {
            return cachedService;
          }
          const wrappedService = interceptActions(value, prefix + prop + NESTED_SERVICE_SEPARATOR, callback);
          serviceCache.set(prop, wrappedService);
          return wrappedService;
        }
      }
      propertyCache.set(prop, returnValue);
      return returnValue;
    },
  }) as unknown as T;
}

// Function to add observable actions to a service
export function addObservableActions<T extends Service>(service: T): WithObservableActions<T> {
  const [actions, notifyActions] = Observe.createEvent<ServiceActionMessages<T>>();
  //  eslint-disable-next-line @typescript-eslint/no-explicit-any -- the compiler is complaining about type recursion for no discernable reason.
  return (interceptActions as any)({ ...service, actions }, '', notifyActions);
}

// Type to map service functions to action messages
export type FunctionsToMessages<T, Prefix extends string = ''> = {
  [K in keyof T]: K extends string
  ? // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed for Parameters<T[K]> to work correctly in this context
  T[K] extends (...args: any[]) => unknown
  ? { action: `${Prefix}${K}`; args: Parameters<T[K]> }
  : never
  : never;
};

// Type to extract sub-services from a service
export type SubServices<T> = NoNever<{
  [K in keyof T]: T[K] extends Service ? T[K] : never;
}>;

// Type to map sub-service actions to messages with a prefix
export type SubServiceActionMessages<T, ParentPrefix extends string = ''> = {
  [K in keyof T]: K extends string ? ServiceActionMessagesWithPrefix<T[K], `${ParentPrefix}${K}${typeof NESTED_SERVICE_SEPARATOR}`> : never;
};

type IsPromiseOrVoid<T> = T extends Promise<unknown> ? true : IsVoid<T>;

export type PromiseOrVoidFunctions<T> = NoNever<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed for the infer R pattern to work correctly with IsPromiseOrVoid
  [K in keyof T]: T[K] extends (...args: any[]) => infer R ? (IsPromiseOrVoid<R> extends true ? T[K] : never) : never;
}>;

// Type to map service actions and sub-service actions to messages with a prefix
export type ServiceActionMessagesWithPrefix<T, Prefix extends string = ''> =
  | FunctionsToMessages<PromiseOrVoidFunctions<T>, Prefix>[keyof FunctionsToMessages<PromiseOrVoidFunctions<T>, Prefix>]
  | (T extends Service
    ? Expand<SubServiceActionMessages<SubServices<T>, Prefix>[keyof SubServiceActionMessages<SubServices<T>, Prefix>]>
    : never);

// Type to map service actions to messages
export type ServiceActionMessages<T> = Extract<ServiceActionMessagesWithPrefix<T>, { action: string }>;

// Compile-time type unit tests
{
  interface GrandChildService extends Service {
    doFive(z: number): void;
    doSix(): void;
  }
  interface ChildService extends Service {
    k: Observe<number>;
    r: Observe<string>;
    doThree(z: number): void;
    doFour(): void;
    grandChild: GrandChildService;
  }

  interface MyService extends Service {
    a: Observe<number>;
    b: Observe<string>;
    doOne(x: number, y: number): void;
    doTwo(): void;
    child: ChildService;
  }

  type MyServiceActionMessages = ServiceActionMessages<MyService>;

  type ExpectedActionMessages =
    | {
      action: 'doOne';
      args: [x: number, y: number];
    }
    | {
      action: 'doTwo';
      args: [];
    }
    | {
      action: 'child_doThree';
      args: [z: number];
    }
    | {
      action: 'child_doFour';
      args: [];
    }
    | {
      action: 'child_grandChild_doFive';
      args: [z: number];
    }
    | {
      action: 'child_grandChild_doSix';
      args: [];
    };

  // Compile-time type check
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- this is a compile time type check.
  type CheckType = True<EquivalentTypes<MyServiceActionMessages, ExpectedActionMessages>>;
}
