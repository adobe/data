import { lineWords } from './protocol.js';

// What the world's thread and a joined thread filling objects share to run that thread's systems (threads.md, "Systems
// on other threads"): a task block of control words, the task's payload and its completion, and a command ring the
// thread's systems write their segments into, as a pool worker's tasks do (`command-ring.ts`).
//
// One task is in flight per thread at a time: the world posts a task, the systems of one tier or of consecutive tiers
// all on that thread, and waits for it before the next tier, or the sync point, starts.

/**
 * The task block's words, each group on a line of its own by the thread writing it: the task the world posted last,
 * then the task the thread finished last; then the command ring's base and capacity in bytes and the payload's and
 * completion's offsets and capacities, which the world sets while no task runs; then the ring's write cursor past its
 * base, which the thread stores at each segment's end and the world resets at sync points, and the bytes its segments
 * needed since, spills included, which the next sync point grows the ring to.
 */
export const taskPostedWord = 0;
export const taskDoneWord = lineWords;
export const ringBaseWord = 2 * lineWords;
export const ringCapacityWord = 2 * lineWords + 1;
export const payloadOffsetWord = 2 * lineWords + 2;
export const payloadCapacityWord = 2 * lineWords + 3;
export const completionOffsetWord = 2 * lineWords + 4;
export const completionCapacityWord = 2 * lineWords + 5;
export const ringCursorWord = 3 * lineWords;
export const ringNeededWord = 3 * lineWords + 1;
export const taskBlockWords = 4 * lineWords;

/**
 * A task's payload, f64 words: its sequence; the sync the thread replays through before it runs; how many systems it
 * runs; whether its input comes by message; then per system, in schedule order, its index on the thread, the tick it
 * takes when it runs, its `lastRun`, its tier within the task, where its folds start in the completion, and for a
 * tail the byte offset of its block (`tail-blocks.ts`), else 0. A task is all tails or none.
 */
export const payloadSequence = 0;
export const payloadSync = 1;
export const payloadCount = 2;
export const payloadInput = 3;
export const payloadSystems = 4;
export const systemFields = 6;
export const systemIndex = 0;
export const systemTick = 1;
export const systemLastRun = 2;
export const systemTier = 3;
export const systemFolds = 4;
export const systemTail = 5;

/** f64 words of a payload for `count` systems. */
export const payloadWords = (count: number): number => payloadSystems + count * systemFields;

/**
 * A task's completion, f64 words: whether a message follows it, with failures, spilled segments, the thread's numbers
 * for keys its commands named for the first time, or the rows a tail wrote from its snapshot; then per system its
 * flags and its segment's start and end past the ring's base; then the systems' folds, at the offsets the payload gives.
 */
export const completionMessage = 0;
export const completionSystems = 1;
export const resultFields = 3;
export const resultFlags = 0;
export const resultStart = 1;
export const resultEnd = 2;

/** f64 words of a completion for `count` systems folding `folds` leaves in all. */
export const completionWords = (count: number, folds: number): number => completionSystems + count * resultFields + folds;

/**
 * A system's result flags: it took its tick, its conditions holding; it ran its rows, so its folds count; it failed,
 * its error in the message; its segment is in the message, past the ring's size.
 */
export const executedFlag = 1;
export const ranFlag = 2;
export const failedFlag = 4;
export const spilledFlag = 8;
