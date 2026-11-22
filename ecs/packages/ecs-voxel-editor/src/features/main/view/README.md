# view

The app: `entry.page.ts`, which `index.html` loads, loads the Spectrum elements and starts it on the page;
`createApp` creates the world, holding the page's element as `root`, keeps a WebGPU device for it, starts every feature's views and ports on it and
the scene's canvas, and creates the world model, seeds the materials and frames it.
