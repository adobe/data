import { Vec3 } from "../index.js";

/** A pure helper a kernel imports: the build inlines it, and it still runs as written everywhere else. */
export const steer = (velocity: Vec3, toward: Vec3, limit: number): Vec3 => {
    const desired = Vec3.subtract(toward, velocity);
    const length = Vec3.length(desired);
    if (length <= limit) return Vec3.add(velocity, desired);
    return Vec3.add(velocity, Vec3.scale(desired, limit / length));
};
