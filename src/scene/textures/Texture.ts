import { EventDispatcher } from "../core/EventDispatcher";

/**
 * A texture to sample in a material, like three.js's `Texture`. The GPU object
 * is owned by the renderer and created when `needsUpdate` is set.
 */
export class Texture extends EventDispatcher {
  readonly isTexture = true;

  name = "";
  image: TexImageSource | ArrayBufferView | null = null;
  needsUpdate = true;

  /** Set by the renderer to create or refresh the GPU resource. */
  userData: Record<string, unknown> = {};

  constructor(image: TexImageSource | ArrayBufferView | null = null) {
    super();
    this.image = image;
  }

  /**
   * Release the GPU resources every renderer holds for this texture, like
   * three.js's `Texture.dispose()`. Renderers listen for the `dispose` event
   * and delete their own copy, so a texture shared by two renderers frees both.
   *
   * The texture object itself stays usable: rendering with it again uploads
   * the image to a fresh GPU texture. Call this when a texture drops out of a
   * scene — an atlas swapped for another, a layer torn down — rather than
   * waiting for the renderer to be disposed with everything else.
   */
  dispose(): void {
    this.dispatchEvent({ type: "dispose" });
  }
}
