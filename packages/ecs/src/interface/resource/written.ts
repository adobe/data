import type { clock } from '../resources/clock.js';

/** Resources only the world writes: systems and finalizers read them, and worlds don't start them at other values. */
export type WorldWritten = typeof clock;
