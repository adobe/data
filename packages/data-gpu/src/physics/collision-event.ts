// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * One flag-gated collision, drained from the GPU event append-buffer. Emitted
 * only for bodies carrying `REPORT_BODY_HITS`, so the CPU sees just the
 * contacts it opted into — cost proportional to usage. `bodyA` is the flagged
 * body; `bodyB` is whatever it struck; `penetration` is the overlap depth at
 * the moment of detection.
 */
export interface CollisionEvent {
    bodyA: number;
    bodyB: number;
    penetration: number;
}
