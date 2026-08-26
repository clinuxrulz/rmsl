import { Matrix3 } from "../math/Matrix3";
import type { Camera } from "../cameras/Camera";
import type { Mesh } from "../objects/Mesh";
import type { InstancedMesh } from "../objects/InstancedMesh";
import type { Scene } from "../scenes/Scene";
import type { BufferGeometry } from "../geometries/BufferGeometry";
import type { BufferAttribute } from "../geometries/BufferAttribute";
import { AmbientLight } from "../lights/AmbientLight";
import { DirectionalLight } from "../lights/DirectionalLight";
import { PointLight } from "../lights/PointLight";
import type { NodeMaterial } from "../materials/NodeMaterial";
import type { Texture } from "../textures/Texture";
import {
  MirroredRepeatWrapping, NearestFilter, NearestMipmapLinearFilter,
  NearestMipmapNearestFilter, RepeatWrapping,
} from "../textures/constants";
import type { GLSLPrecision } from "../../rmsl";

/**
 * Which shader precision a program compiles with, mirroring three.js: a
 * material's own `precision` overrides the renderer's default (which is what a
 * `null` material precision keeps).
 */
export function shaderPrecision(
  material: NodeMaterial,
  rendererPrecision: GLSLPrecision,
): GLSLPrecision {
  return material.precision ?? rendererPrecision;
}

/**
 * The value a camera-scoped uniform should hold this frame, given its logical
 * name. Unknown names return an empty array, which the renderer treats as
 * "nothing to upload".
 */
export function cameraUniformValue(name: string, camera: Camera): number[] {
  switch (name) {
    case "projectionMatrix":
      return camera.projectionMatrix.elements;
    case "viewMatrix":
      return camera.matrixWorldInverse.elements;
    case "cameraPosition":
      return camera.getWorldPosition().toArray();
    default:
      return [];
  }
}

/**
 * The value an object-scoped uniform should hold for a mesh, given its logical
 * name. `normalMatrix` is the inverse-transpose of the world matrix's upper
 * 3x3, computed on the host.
 */
export function objectUniformValue(name: string, mesh: Mesh): number[] {
  switch (name) {
    case "modelMatrix":
      return mesh.matrixWorld.elements;
    case "normalMatrix":
      return _normalMatrix.getNormalMatrix(mesh.matrixWorld).toArray();
    default:
      return [];
  }
}

/**
 * The attribute a shader input reads from, for a drawable and its geometry.
 * An `InstancedMesh` keeps `instanceMatrix`/`instanceColor` on the object
 * rather than the geometry (three.js does the same), so those two names fall
 * back to the object when the geometry does not carry them.
 */
export function geometryAttribute(
  mesh: Mesh,
  geometry: BufferGeometry,
  name: string,
): BufferAttribute | undefined {
  const fromGeometry = geometry.attributes[name];
  if (fromGeometry) return fromGeometry;
  if (name === "instanceMatrix") return (mesh as InstancedMesh).instanceMatrix;
  if (name === "instanceColor") return (mesh as InstancedMesh).instanceColor ?? undefined;
  return undefined;
}

const _normalMatrix = new Matrix3();

/**
 * The value a renderer-scoped uniform should hold this frame, given its
 * logical name and the drawing surface's device-pixel size. Unknown names
 * return an empty array, which the renderer treats as "nothing to upload".
 */
export function rendererUniformValue(name: string, width: number, height: number): number[] {
  switch (name) {
    case "resolution":
      return [width, height];
    default:
      return [];
  }
}

/**
 * A signature of a scene's light set, in traversal order. When it changes the
 * shaders a material compiled against (light uniforms are baked in) must be
 * rebuilt.
 */
export function lightsSignature(scene: Scene): string {
  let signature = "";
  scene.traverseVisible((object) => {
    if (object instanceof AmbientLight) signature += "a";
    else if (object instanceof DirectionalLight) signature += "d";
    else if (object instanceof PointLight) signature += "p";
  });
  return signature;
}

/**
 * The signature identifying one compiled program: the scene's light set plus
 * the drawable's instancing flags. A shared material therefore compiles one
 * program per distinct combination — a plain mesh and an `InstancedMesh` with
 * the same material get different shaders, exactly as the per-instance
 * attributes only exist for the instanced one.
 */
export function programSignature(lights: string, instancing: boolean, instancingColor: boolean): string {
  return `${lights}|${instancing ? "i" : ""}${instancingColor ? "c" : ""}`;
}

/** The WGSL spelling of an RMSL shader type, for uniform struct members. */
export function wgslTypeName(type: string): string {
  switch (type) {
    case "float": return "f32";
    case "int": return "i32";
    case "uint": return "u32";
    case "vec2": return "vec2<f32>";
    case "vec3": return "vec3<f32>";
    case "vec4": return "vec4<f32>";
    case "ivec2": return "vec2<i32>";
    case "ivec3": return "vec3<i32>";
    case "ivec4": return "vec4<i32>";
    case "uvec2": return "vec2<u32>";
    case "uvec3": return "vec3<u32>";
    case "uvec4": return "vec4<u32>";
    case "mat2": return "mat2x2<f32>";
    case "mat3": return "mat3x3<f32>";
    case "mat4": return "mat4x4<f32>";
    default: return "f32";
  }
}

/**
 * How a texture is sampled, in terms neither backend's spelling: what to do
 * between texels, and what to do outside the image.
 *
 * Both renderers read the same three.js-style fields off a `Texture` and then
 * spell the answer their own way — `texParameteri` constants in WebGL, sampler
 * descriptor strings in WebGPU — so the rule for turning one into the other
 * lives here once, where it can be tested without a graphics device.
 */
export interface SamplerState {
  magFilter: "nearest" | "linear";
  minFilter: "nearest" | "linear";
  wrapS: TextureWrap;
  wrapT: TextureWrap;
  wrapR: TextureWrap;
}

export type TextureWrap = "clamp" | "repeat" | "mirror";

/**
 * The sampler state a texture asks for, as a sampler of `samplerType` can
 * honour it.
 *
 * An integer texture is not filterable in either language, so it reads with
 * nearest whatever it asked for. A mipmapped minification filter is treated as
 * its base filter, because no renderer builds a mip chain: honouring it
 * literally would leave WebGL with an incomplete texture, which samples as
 * black — see https://github.com/big-mesh-studios/rmsl/issues/3.
 */
export function samplerState(texture: Texture, samplerType: string): SamplerState {
  const filterable = !isIntegerSampler(samplerType);
  return {
    magFilter: filterable ? textureFilter(texture.magFilter) : "nearest",
    minFilter: filterable ? textureFilter(texture.minFilter) : "nearest",
    wrapS: textureWrap(texture.wrapS),
    wrapT: textureWrap(texture.wrapT),
    wrapR: textureWrap(texture.wrapR),
  };
}

/** A `Texture` filter constant as the choice between texels it stands for. */
function textureFilter(filter: number): "nearest" | "linear" {
  switch (filter) {
    case NearestFilter:
    case NearestMipmapNearestFilter:
    case NearestMipmapLinearFilter:
      return "nearest";
    default:
      return "linear";
  }
}

/** A `Texture` wrapping constant as what it does outside the image. */
function textureWrap(wrap: number): TextureWrap {
  switch (wrap) {
    case RepeatWrapping:
      return "repeat";
    case MirroredRepeatWrapping:
      return "mirror";
    default:
      return "clamp";
  }
}

/** Whether a sampler type reads an integer texture (unfiltered texels). */
export function isIntegerSampler(type: string): boolean {
  return type.startsWith("isampler") || type.startsWith("usampler");
}

/**
 * The WebGPU `GPUTextureSampleType` a sampler type requires: integer textures
 * are `sint`/`uint`, everything else samples as floats.
 */
export function samplerSampleType(type: string): "float" | "sint" | "uint" {
  if (type.startsWith("isampler")) return "sint";
  if (type.startsWith("usampler")) return "uint";
  return "float";
}

/** Whether a sampler type addresses a volume rather than a surface. */
export function samplerDimension(type: string): "2d" | "3d" {
  return type.endsWith("3D") ? "3d" : "2d";
}

/**
 * A scalar uniform value uploads as a single element; vector/matrix values as
 * their component array. `scalar` is non-null exactly for a bare number, so a
 * caller can upload it directly — indexing `[0]` on a bare number is undefined
 * and silently uploads NaN, which is how a lit material once rendered black.
 */
export function uniformUploadValue(
  value: number | number[] | Float32Array,
): { scalar: number | null; array: Float32Array } {
  if (typeof value === "number") {
    return { scalar: value, array: new Float32Array([value]) };
  }
  return { scalar: null, array: new Float32Array(value as number[] | Float32Array) };
}

/**
 * A buffer upload source from a geometry array, converting a plain `number[]`
 * to the typed view a GPU upload needs. `index` picks an unsigned element type
 * for element buffers; vertex attributes default to floats.
 */
export function toBufferView(
  array: ArrayLike<number>,
  index = false,
): ArrayBufferView<ArrayBuffer> {
  if (ArrayBuffer.isView(array)) return array as unknown as ArrayBufferView<ArrayBuffer>;
  if (index) {
    let max = -Infinity;
    for (let i = 0; i < array.length; i++) if (array[i] > max) max = array[i];
    return max > 65535 ? new Uint32Array(array) : new Uint16Array(array);
  }
  return new Float32Array(array);
}
