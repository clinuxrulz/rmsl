import { EventDispatcher } from "../core/EventDispatcher";
import { ClampToEdgeWrapping, LinearFilter } from "./constants";

/**
 * A texture to sample in a material, like three.js's `Texture`. The GPU object
 * is owned by the renderer and created when `needsUpdate` is set.
 */
export class Texture extends EventDispatcher {
  readonly isTexture = true;

  name = "";
  image: TexImageSource | ArrayBufferView | null = null;
  /**
   * Tells the renderer to create or refresh the GPU resource. The filtering and
   * wrapping below need it too: a renderer reads them when it uploads, so a
   * change made after that reaches the GPU on the next upload.
   */
  needsUpdate = true;

  /**
   * How a texel is chosen when the sampled point falls between texels, like
   * three.js's `magFilter`: `LinearFilter` (the default) blends the neighbours,
   * `NearestFilter` keeps texels square.
   */
  magFilter: number = LinearFilter;
  /**
   * The same choice for a minified image, like three.js's `minFilter`. The
   * mipmapped values are accepted and treated as their base filter, since no
   * renderer builds a mip chain yet — which is also why the default is
   * `LinearFilter` rather than three.js's `LinearMipmapLinearFilter`.
   */
  minFilter: number = LinearFilter;

  /**
   * What happens to a coordinate outside `0..1`, per axis, like three.js's
   * `wrapS`/`wrapT`/`wrapR`: `ClampToEdgeWrapping` (the default),
   * `RepeatWrapping` or `MirroredRepeatWrapping`. `wrapR` is the third axis of
   * a 3D texture, and is ignored for a 2D one.
   */
  wrapS: number = ClampToEdgeWrapping;
  wrapT: number = ClampToEdgeWrapping;
  wrapR: number = ClampToEdgeWrapping;

  /** Free-form data for the host, like three.js's; no renderer reads it. */
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
