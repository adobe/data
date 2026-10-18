import type { threadClaims } from '../components/thread-claims.js';
import type { threadStatus } from '../components/thread-status.js';

/** Components only the world writes: systems read them, and commands never add, remove or spawn them. */
export type WorldWritten = typeof threadClaims | typeof threadStatus;
