// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Plugin } from '@adobe/ecs';
import { Frame } from '@adobe/ecs-gpu';

/** What releases the resources `drawFrame`'s updates make, which the app runs rather than adds. */
export const particlesView: Plugin = {
    systems: [Frame.releases],
};
