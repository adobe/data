// © 2026 Adobe. MIT License. See /LICENSE for details.
import { waiting } from "./internal/constant.waiting.js";

/** Resolves after the next tick's observer systems ran: the DOM shows what the runs before it changed. */
export const nextTick = (): Promise<void> => new Promise(resolve => waiting.push(resolve));
