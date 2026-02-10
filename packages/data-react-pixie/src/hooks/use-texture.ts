import { Assets, type Texture } from "pixi.js";
import { useEffect, useState } from "react";

export function useTexture(url: string): Texture | undefined {
  const [texture, setTexture] = useState<Texture | undefined>();

  useEffect(() => {
    let cancelled = false;
    Assets.load(url)
      .then((result) => {
        if (!cancelled) setTexture(result);
      })
      .catch((err) => {
        if (!cancelled) console.error("Failed to load texture:", url, err);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return texture;
}
