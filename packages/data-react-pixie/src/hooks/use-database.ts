import { useDatabase as useDatabaseHook } from '@adobe/data-react';
import { pixiePlugin } from '../pixie-plugin';

export function useDatabase() {
    return useDatabaseHook(pixiePlugin);
}