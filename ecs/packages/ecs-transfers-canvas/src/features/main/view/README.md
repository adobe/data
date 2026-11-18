# view

The sample's page and the world's worker, each started by an entry.

`entry.page.ts`, which `index.html` loads, starts the world's worker and the loader's, moves the canvas to the world's
thread, joins the world and shows its counts in the overlay. `entry.world-worker.ts` starts the world with the
sprites' model and view plugins and shares it on the ports the page sends.
