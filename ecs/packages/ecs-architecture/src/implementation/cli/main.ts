// © 2026 Adobe. MIT License. See /LICENSE for details.
import { run } from './run.js';

void run(process.argv.slice(2), process.cwd()).then(({ output, code }) => {
    process.stdout.write(output);
    process.exitCode = code;
});
