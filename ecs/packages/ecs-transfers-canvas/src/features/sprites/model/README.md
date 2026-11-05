# model

Sprites, each a texture moving around the canvas.

Each bounces off its edges. `texture` and `surface` are registered with `transfer: true`: they hold an `ImageBitmap` and an `OffscreenCanvas`,
which move between threads rather than being copied. `attachSurface` and `addSprite` take what main and the loader
move in their input; `stats` counts the sprites and the frames drawn.
