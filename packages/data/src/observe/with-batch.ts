// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Observe } from "./index.js";

/**
 * Creates a new Observe function that batches multiple rapid emissions into a single notification.
 * If multiple values are emitted within the same microtask, only the last value is forwarded to observers
 * after the microtask boundary.
 */
export function withBatch<T>(observable: Observe<T>): Observe<T> {
    return (observer) => {
        let pendingValue: T;
        let hasPendingValue = false;
        let isScheduled = false;
        let hasInitialValue = false;

        const scheduleNotification = () => {
            if (!isScheduled) {
                isScheduled = true;
                queueMicrotask(() => {
                    if (hasPendingValue) {
                        const value = pendingValue;
                        hasPendingValue = false;
                        observer(value);
                    }
                    isScheduled = false;
                });
            }
        };

        const unobserve = observable((value) => {
            if (!hasInitialValue) {
                observer(value);
                hasInitialValue = true;
            } else {
                pendingValue = value;
                hasPendingValue = true;
                scheduleNotification();
            }
        });

        return () => {
            unobserve();
            hasPendingValue = false;
            isScheduled = false;
            hasInitialValue = false;
        };
    };
} 