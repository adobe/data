# ports

Loads the sprites' textures, as it would fetch and decode images.

`spritesPorts` connects on the loader's thread: it makes each texture, decodes it to an `ImageBitmap` and runs
`addSprite` with it, moving the bitmap to the world's thread, until disconnected.
