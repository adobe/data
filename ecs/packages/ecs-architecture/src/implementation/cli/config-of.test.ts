import { expect, it } from 'vitest';
import { configOf } from './config-of.js';

it('says where what a setting of 0.4 configured has gone', () => {
    expect(configOf({ apps: ['app'] })).toMatch(/features\/main.*Upgrading to 0\.5/);
    expect(configOf({ systems: ['model'] })).toMatch(/plugin\.<feature>-<layer>\.ts.*Upgrading to 0\.5/);
    expect(configOf({ other: 1 })).toMatch(/isn't a setting: source, layers/);
});
