// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Type-level tests for UIService.IsValid and UIService.FromService.
 *
 * Demonstrates:
 * 1. A service whose surface is observe + void actions is valid.
 * 2. A service that returns Promise/AsyncGenerator/data is NOT valid.
 * 3. FromService<Valid> = Valid (passthrough).
 * 4. FromService<Invalid> rewrites every non-Observe-returning function
 *    to return void, leaving Observe properties and Observe-factory
 *    functions untouched.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import { Observe } from "../../observe/index.js";
import { Assert } from "../../types/assert.js";
import { Equal } from "../../types/equal.js";
import { Service } from "../service.js";
import { UIService } from "./ui-service.js";

// ============================================================================
// VALID UI SERVICE
// ============================================================================

interface UserUIService extends Service {
  currentUser: Observe<{ readonly id: string; readonly name: string } | null>;
  selectUserById: (id: string) => Observe<{ readonly id: string; readonly name: string } | null>;
  // Non-Data argument is permitted on a UIService action — UI handlers
  // routinely receive DOM elements, Events, or framework refs.
  drawTo: (canvas: HTMLCanvasElement) => void;
  // Non-Data Observe payloads are permitted too.
  hoveredElement: Observe<HTMLElement | null>;
  clear: () => void;
  readonly inner: {
    readonly count: Observe<number>;
    reset: () => void;
  };
}

type _ValidateUserUIService = Assert<UIService.IsValid<UserUIService>>;

// FromService passes a valid service through unchanged.
type _ValidPassthrough = Assert<Equal<UIService.FromService<UserUIService>, UserUIService>>;

// ============================================================================
// INVALID -> FROMSERVICE RESTRICTION
// ============================================================================

interface BackendService extends Service {
  currentUser: Observe<{ readonly id: string } | null>;
  selectById: (id: string) => Observe<{ readonly id: string } | null>;
  fetchUser: (id: string) => Promise<{ readonly id: string }>;
  updateUser: (id: string, name: string) => Promise<void>;
  stream: () => AsyncGenerator<string>;
  clear: () => void;
}

// Promise / AsyncGenerator functions disqualify this as a UIService.
// @ts-expect-error — BackendService is not a valid UIService
type _RejectBackendService = Assert<UIService.IsValid<BackendService>>;

// FromService rewrites the offending returns to void; Observe surfaces stay intact.
type RestrictedBackend = UIService.FromService<BackendService>;

type _CheckRestrictedIsValid = Assert<UIService.IsValid<RestrictedBackend>>;

type _CheckCurrentUserPreserved = Assert<
  Equal<RestrictedBackend["currentUser"], BackendService["currentUser"]>
>;
type _CheckSelectByIdPreserved = Assert<
  Equal<RestrictedBackend["selectById"], BackendService["selectById"]>
>;
type _CheckFetchUserNowVoid = Assert<
  Equal<RestrictedBackend["fetchUser"], (id: string) => void>
>;
type _CheckUpdateUserNowVoid = Assert<
  Equal<RestrictedBackend["updateUser"], (id: string, name: string) => void>
>;
type _CheckStreamNowVoid = Assert<
  Equal<RestrictedBackend["stream"], () => void>
>;
type _CheckClearStillVoid = Assert<
  Equal<RestrictedBackend["clear"], () => void>
>;

