// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Service } from "@adobe/data/service";
import { AsyncDataService } from "@adobe/data/service";
import type { Assert } from "@adobe/data/types";
import type { BoardState } from "../../data/board-state/board-state.js";

/**
 * Async port that chooses the opponent's next move: given the current board it
 * resolves with the index (0-8) of the cell to play. Async so it can stand in
 * for a network- or model-backed move selector — the latency across this
 * boundary is real. The deterministic double replaces it under test.
 */
export interface OpponentService extends Service {
  selectMove: (board: BoardState) => Promise<number>;
}

// Contract conforms to the async-data-service pattern (async-only members).
type _Valid = Assert<AsyncDataService.IsValid<OpponentService>>;

export * as OpponentService from "./public.js";
