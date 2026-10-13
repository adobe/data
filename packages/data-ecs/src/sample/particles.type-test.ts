import { Resource } from '../resource/resource.js';
import { count } from './particles.js';

// @ts-expect-error a resource schema requires a default
Resource.register(count, { type: { type: "integer" } });
// @ts-expect-error the default must match the resource type
Resource.register(count, { type: { type: "integer", default: "none" } });
