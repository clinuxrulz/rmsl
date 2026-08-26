/** Texel layout of a texture's image data, like three.js's texture constants. */
export const RGBAFormat = 1023;
/** Single-channel unsigned-integer red texel layout, like three.js's `RedIntegerFormat`. */
export const RedIntegerFormat = 36244;

/** The element type of the image data, like three.js's `UnsignedByteType`. */
export const UnsignedByteType = 1009;

// === Wrapping ===
//
// What a sampler does with a coordinate outside 0..1. The numbers are three.js's
// own, so a value carried over from a three.js texture means the same thing here.

/** The image tiles: the fractional part of the coordinate is used. */
export const RepeatWrapping = 1000;
/** The edge texel is stretched outwards. The default. */
export const ClampToEdgeWrapping = 1001;
/** The image tiles, flipping on every other repeat. */
export const MirroredRepeatWrapping = 1002;

// === Filtering ===
//
// How a texel is chosen when the sampled point falls between texels (`magFilter`)
// or when the image is minified (`minFilter`).

/** The nearest texel, so texels stay square — what pixel art wants. */
export const NearestFilter = 1003;
/** A weighted average of the surrounding texels. The default. */
export const LinearFilter = 1006;

// The mipmapped minification filters. Accepted so a three.js texture keeps its
// meaning, but no renderer here builds a mip chain yet, so each is treated as
// its base filter — `LinearMipmapLinearFilter` samples like `LinearFilter`.
// See https://github.com/big-mesh-studios/rmsl/issues/3.
export const NearestMipmapNearestFilter = 1004;
export const NearestMipmapLinearFilter = 1005;
export const LinearMipmapNearestFilter = 1007;
export const LinearMipmapLinearFilter = 1008;
