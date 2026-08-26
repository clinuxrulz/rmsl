/**
 * Testing utilities for shader logic, run on the CPU.
 *
 * A shader's arithmetic is ordinary logic — a colour ramp, a signed distance
 * field, a lighting term — and testing it should not need a browser, a canvas
 * or a graphics device. RMSL already compiles a node graph to a JavaScript
 * callable (see `compileJS`); this module is the part around it that makes the
 * callable pleasant to assert on: inputs given as the nodes themselves rather
 * than generated slot names, a whole grid of fragments evaluated in one call,
 * and comparisons that tolerate the last bit of a float.
 *
 * ```typescript
 * import { evaluate, render, approx } from "@random-mesh/rmsl/test";
 *
 * const colour = evaluate(() => ramp(), { uniforms: [[uTint, [1, 0, 0]]] });
 * expect(colour.value).toSatisfy(approx([1, 0, 0, 1]));
 * ```
 *
 * What runs here is the fragment (or vertex) function itself. There is no
 * rasterizer: no triangles, no interpolation, no depth test. A varying is a
 * value you pass in, which is what makes a single fragment addressable.
 */

import {
  compileJS, compileJSFn,
  type Node, type ShaderType, type VariableNode,
  type JsShaderContext, type JsTextureData,
} from "../rmsl";

// === Values ===

/**
 * The JavaScript value a shader type carries on the CPU: scalars are numbers
 * (or booleans), vectors and matrices are flat arrays — matrices in the
 * column-major order the rest of the library uses.
 */
export type ShaderValue<A extends ShaderType> =
  A extends "float" | "int" | "uint" ? number
    : A extends "bool" ? boolean
      : A extends "bvec2" | "bvec3" | "bvec4" ? boolean[]
        : A extends `${string}sampler${string}` ? TextureData
          : A extends "void" ? never
            : number[];

/**
 * Texture data to sample from. A scene `DataTexture` fits as it stands: its
 * `image` is read when `data` is absent.
 */
export type TextureData = JsTextureData | {
  image: ArrayLike<number>;
  width: number;
  height: number;
  depth?: number;
};

/**
 * A value for one uniform, varying or attribute, given as the node itself —
 * `[uTint, [1, 0, 0]]`. The node knows which slot it is; nothing here needs the
 * generated `_rmsl_u0` names.
 */
export type ValueBinding = {
  [A in ShaderType]: readonly [VariableNode<A>, ShaderValue<A>]
}[ShaderType];

/** A texture for one sampler node. */
export type TextureBinding = {
  [A in Extract<ShaderType, `${string}sampler${string}`>]: readonly [VariableNode<A>, TextureData]
}[Extract<ShaderType, `${string}sampler${string}`>];

// === Inputs ===

/** What a shader reads when it is evaluated. */
export interface ShaderInputs {
  uniforms?: readonly ValueBinding[];
  varyings?: readonly ValueBinding[];
  attributes?: readonly ValueBinding[];
  textures?: readonly TextureBinding[];
  /** The pixel `fragCoord()` reports, as `[x, y]`. */
  fragCoord?: readonly [number, number];
}

export interface RunnerOptions extends ShaderInputs {
  /** Which stage the graph is compiled as. Default `"fragment"`. */
  stage?: "vertex" | "fragment";
  /**
   * What `fwidth`/`dFdx`/`dFdy` do. A derivative is the difference between
   * neighbouring pixels, which a single CPU evaluation has no notion of, so
   * they are zero here by default rather than a compile error — an anti-aliased
   * edge reads as a hard one. Pass `"throw"` to be told instead.
   */
  derivatives?: "zero" | "throw";
  /** Give each call its own scratch variables. Default `false`. */
  reentrant?: boolean;
}

/** What a shader produced for one fragment. */
export interface EvaluationResult<A extends ShaderType = ShaderType> {
  /** The graph's own value, or `null` for a fragment that discarded. */
  value: ShaderValue<A> | null;
  /** Whether the fragment ran into `Discard()`. */
  discarded: boolean;
  /** Values written with `output()`, by slot name. */
  outputs: Record<string, unknown>;
  /** Values written with `varying()` in a vertex stage, by slot name. */
  varyings: Record<string, unknown>;
  /** Written with `builtinPosition()`. */
  position?: number[];
  /** Written with `builtinFragDepth()`. */
  fragDepth?: number;
}

/** A compiled shader, ready to be called once per fragment. */
export interface ShaderRunner<A extends ShaderType = ShaderType> {
  (inputs?: ShaderInputs): EvaluationResult<A>;
  /** The generated JavaScript, for when a result needs explaining. */
  readonly source: string;
}

const RUNNER = Symbol.for("rmsl.test.runner");

/**
 * Compile a shader graph once, to be evaluated many times.
 *
 * `evaluate` and `render` compile on every call, which is what you want for a
 * single assertion. Reach for this when the same graph is measured across many
 * inputs — a sweep over a uniform, a search for where a distance field crosses
 * zero — so the compile is not repeated per sample.
 *
 * The graph is given as a thunk, so a function taking arguments is tested by
 * calling it: `runner(() => myFn(float(2), vec2(1, 0)))`.
 */
export function runner<A extends ShaderType>(
  graph: () => Node<A>,
  options: RunnerOptions = {},
): ShaderRunner<A> {
  const compileOptions = {
    name: "rmslTestShader",
    params: [],
    stage: options.stage ?? "fragment",
    derivatives: options.derivatives ?? "zero",
    reentrant: options.reentrant ?? false,
  };
  const callable = compileJS(graph, compileOptions);
  const source = compileJSFn(graph, compileOptions);

  const run = (inputs: ShaderInputs = {}): EvaluationResult<A> =>
    readResult<A>(callable(mergeContext(options, inputs)));
  return Object.defineProperties(run, {
    source: { value: source, enumerable: true },
    [RUNNER]: { value: true },
  }) as ShaderRunner<A>;
}

/**
 * Evaluate a shader graph for one fragment.
 *
 * ```typescript
 * const result = evaluate(() => tint(), {
 *   uniforms: [[uTint, [1, 0, 0]]],
 *   varyings: [[vUv, [0.5, 0.5]]],
 * });
 * ```
 */
export function evaluate<A extends ShaderType>(
  graph: (() => Node<A>) | ShaderRunner<A>,
  inputs: ShaderInputs & RunnerOptions = {},
): EvaluationResult<A> {
  return asRunner(graph, inputs)(inputs);
}

// === Rendering a grid ===

/** Which fragment of a grid render is being evaluated. */
export interface Fragment {
  /** Column, `0` to `width - 1`. */
  x: number;
  /** Row, `0` to `height - 1`, counting up from the bottom. */
  y: number;
  /** `x` and `y` mapped to the middle of the pixel, in `0..1`. */
  u: number;
  v: number;
  /** What `fragCoord()` reports here: the pixel centre. */
  fragCoord: [number, number];
}

export interface RenderOptions extends ShaderInputs, RunnerOptions {
  width: number;
  height: number;
  /**
   * Inputs that differ per fragment, merged over the shared ones — the usual
   * home for a `uv` varying:
   *
   * ```typescript
   * inputs: ({ u, v }) => ({ varyings: [[vUv, [u, v]]] })
   * ```
   */
  inputs?: (fragment: Fragment) => ShaderInputs | void;
}

/** A grid of evaluated fragments. */
export interface RenderedImage {
  width: number;
  height: number;
  /**
   * Four channels per fragment, row-major from `y = 0` — the bottom row, as
   * `fragCoord` counts. A fragment that discarded is four zeroes.
   */
  pixels: Float32Array;
  /** The four channels at one fragment. */
  at(x: number, y: number): [number, number, number, number];
  /** Whether the fragment at `x, y` discarded. */
  isDiscarded(x: number, y: number): boolean;
  /** The result the fragment at `x, y` produced, in full. */
  resultAt(x: number, y: number): EvaluationResult;
  /**
   * The image as clamped 8-bit RGBA, for a snapshot or an image file. Rows run
   * bottom-up like `pixels`; pass `{ flipY: true }` for the top-down order most
   * image formats want.
   */
  toUint8(options?: { flipY?: boolean }): Uint8ClampedArray;
  /**
   * The image as text, one character per fragment by brightness — a shader
   * snapshot that reads in a terminal diff. The top line is the top row of the
   * image; pass `{ flipY: true }` to print from `y = 0` instead.
   */
  toAscii(options?: { ramp?: string; flipY?: boolean }): string;
}

const DEFAULT_RAMP = " .:-=+*#%@";

/**
 * Evaluate a shader across a grid of fragments.
 *
 * Nothing is rasterized: every fragment in the rectangle is evaluated, in
 * reading order. That is what makes an assertion about a *shape* possible —
 * where an edge falls, whether a ramp is monotonic, which corner is brightest —
 * without a canvas to read pixels back from.
 */
export function render<A extends ShaderType>(
  graph: (() => Node<A>) | ShaderRunner<A>,
  options: RenderOptions,
): RenderedImage {
  const { width, height } = options;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(`[RMSL/test] render needs a whole width and height of at least 1, got ${width}x${height}`);
  }
  const run = asRunner(graph, options);
  const pixels = new Float32Array(width * height * 4);
  const results: EvaluationResult<A>[] = new Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const fragCoord: [number, number] = [x + 0.5, y + 0.5];
      const perFragment = options.inputs?.({
        x, y, u: fragCoord[0] / width, v: fragCoord[1] / height, fragCoord,
      }) ?? {};
      const result = run({ fragCoord, ...perFragment });
      const index = y * width + x;
      results[index] = result;
      if (!result.discarded) pixels.set(toRGBA(result), index * 4);
    }
  }
  return image(width, height, pixels, results);
}

function image(
  width: number,
  height: number,
  pixels: Float32Array,
  results: EvaluationResult<ShaderType>[],
): RenderedImage {
  const indexOf = (x: number, y: number): number => {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height) {
      throw new Error(`[RMSL/test] (${x}, ${y}) is outside the ${width}x${height} image`);
    }
    return y * width + x;
  };
  return {
    width,
    height,
    pixels,
    at(x, y) {
      const base = indexOf(x, y) * 4;
      return [pixels[base], pixels[base + 1], pixels[base + 2], pixels[base + 3]];
    },
    isDiscarded(x, y) {
      return results[indexOf(x, y)].discarded;
    },
    resultAt(x, y) {
      return results[indexOf(x, y)];
    },
    toUint8({ flipY = false } = {}) {
      const out = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++) {
        const row = flipY ? height - 1 - y : y;
        for (let i = 0; i < width * 4; i++) {
          out[y * width * 4 + i] = pixels[row * width * 4 + i] * 255;
        }
      }
      return out;
    },
    toAscii({ ramp = DEFAULT_RAMP, flipY = false } = {}) {
      const lines: string[] = [];
      for (let y = 0; y < height; y++) {
        const row = flipY ? y : height - 1 - y;
        let line = "";
        for (let x = 0; x < width; x++) {
          const base = (row * width + x) * 4;
          // Rec. 709 luminance, the weighting a monitor's channels carry.
          const luma = 0.2126 * pixels[base] + 0.7152 * pixels[base + 1] + 0.0722 * pixels[base + 2];
          const step = Math.round(Math.min(1, Math.max(0, luma)) * (ramp.length - 1));
          line += ramp[step];
        }
        lines.push(line);
      }
      return lines.join("\n");
    },
  };
}

/**
 * The uniform nodes a graph reads, in the order they are reached, each name
 * appearing once. With a shader type, only the uniforms of that type — which
 * is the form that can be bound, since a binding has to know what it holds.
 *
 * Most uniforms are held by the test that made them, and binding is
 * `[uTint, [1, 0, 0]]`. Some are not: `uv()` mints a screen-size uniform inside
 * the graph, and a caller who never saw that node has no other way to reach it:
 *
 * ```typescript
 * const [resolution] = uniformsIn(graph, "vec2");
 * render(() => graph, { width: 8, height: 8, uniforms: [[resolution, [8, 8]]] });
 * ```
 */
export function uniformsIn<A extends ShaderType>(graph: Node<ShaderType>, type: A): VariableNode<A>[];
export function uniformsIn(graph: Node<ShaderType>): VariableNode<ShaderType>[];
export function uniformsIn(graph: Node<ShaderType>, type?: ShaderType): VariableNode<ShaderType>[] {
  const found: VariableNode<ShaderType>[] = [];
  const named = new Set<string>();
  const seen = new Set<unknown>();
  const walk = (node: unknown): void => {
    if (typeof node !== "object" || node === null || seen.has(node)) return;
    seen.add(node);
    const current = node as { type?: string; name?: string; params?: unknown[]; value?: unknown };
    if ((current.type === "uniform" || current.type === "uniformArray") && current.name && !named.has(current.name)) {
      named.add(current.name);
      found.push(node as VariableNode<ShaderType>);
    }
    for (const param of current.params ?? []) walk(param);
    // A uniform array element carries its array in `value`, not in `params`.
    if (current.value && typeof current.value === "object") walk(current.value);
  };
  walk(graph);
  return type === undefined ? found : found.filter((node) => node._t === type);
}

// === Comparing ===

/**
 * How far apart two results of the same magnitude may be.
 *
 * A shader's arithmetic is not reproduced exactly by the arithmetic a test
 * writes out by hand — an operation may be evaluated in another order, or
 * through another identity — and the gap grows with the numbers involved. The
 * allowance scales with magnitude, with a floor for values near zero where a
 * relative gap collapses to nothing.
 */
export function tolerance(magnitude: number): number {
  return Math.max(1e-6, Math.abs(magnitude) * 1e-6);
}

/** Whether two shader values agree, within `options.tolerance`. */
export function closeTo(
  actual: unknown,
  expected: unknown,
  options: { tolerance?: number } = {},
): boolean {
  return difference(actual, expected, options.tolerance) === null;
}

/**
 * A predicate for one expected value, for a matcher that takes one:
 * `expect(result.value).toSatisfy(approx([1, 0, 0, 1]))`.
 */
export function approx(
  expected: unknown,
  options: { tolerance?: number } = {},
): (actual: unknown) => boolean {
  return (actual: unknown) => closeTo(actual, expected, options);
}

/**
 * Throw unless two shader values agree, with a message naming the component
 * that differs. Framework-agnostic: it needs no matcher and no test runner.
 */
export function assertClose(
  actual: unknown,
  expected: unknown,
  options: { tolerance?: number; message?: string } = {},
): void {
  const reason = difference(actual, expected, options.tolerance);
  if (reason === null) return;
  const prefix = options.message ? `${options.message}: ` : "";
  throw new Error(
    `[RMSL/test] ${prefix}${reason}`
    + `\n  expected: ${format(expected)}`
    + `\n  actual:   ${format(actual)}`,
  );
}

/** What differs between two values, or `null` when nothing does. */
function difference(actual: unknown, expected: unknown, allowed?: number): string | null {
  if (typeof expected === "boolean" || typeof actual === "boolean") {
    return actual === expected ? null : `expected ${format(expected)}, got ${format(actual)}`;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return `expected an array of ${expected.length}, got ${format(actual)}`;
    if (actual.length !== expected.length) {
      return `expected ${expected.length} components, got ${actual.length}`;
    }
    for (let i = 0; i < expected.length; i++) {
      const reason = difference(actual[i], expected[i], allowed);
      if (reason !== null) return `component ${i}: ${reason}`;
    }
    return null;
  }
  if (typeof expected !== "number" || typeof actual !== "number") {
    return actual === expected ? null : `expected ${format(expected)}, got ${format(actual)}`;
  }
  if (Number.isNaN(expected) && Number.isNaN(actual)) return null;
  const gap = Math.abs(actual - expected);
  const limit = allowed ?? tolerance(expected);
  return gap <= limit ? null : `expected ${expected}, got ${actual} (off by ${gap}, allowed ${limit})`;
}

function format(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(format).join(", ")}]`;
  return String(value);
}

// === Plumbing ===

function asRunner<A extends ShaderType>(
  graph: (() => Node<A>) | ShaderRunner<A>,
  options: RunnerOptions,
): ShaderRunner<A> {
  return (graph as unknown as Record<symbol, unknown>)[RUNNER]
    ? graph as ShaderRunner<A>
    : runner(graph as () => Node<A>, options);
}

/** Slot-keyed context for the compiled callable, defaults under the call's own. */
function mergeContext(defaults: ShaderInputs, inputs: ShaderInputs): JsShaderContext {
  return {
    uniforms: slots(defaults.uniforms, inputs.uniforms),
    varyings: slots(defaults.varyings, inputs.varyings),
    attributes: slots(defaults.attributes, inputs.attributes),
    textures: textureSlots(defaults.textures, inputs.textures),
    fragCoord: (inputs.fragCoord ?? defaults.fragCoord) as [number, number] | undefined,
  };
}

function slots(...lists: (readonly ValueBinding[] | undefined)[]): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const list of lists) {
    for (const [node, value] of list ?? []) record[node.name] = value;
  }
  return record;
}

function textureSlots(
  ...lists: (readonly TextureBinding[] | undefined)[]
): Record<string, JsTextureData> {
  const record: Record<string, JsTextureData> = {};
  for (const list of lists) {
    for (const [node, texture] of list ?? []) {
      const data = "data" in texture ? texture.data : texture.image;
      record[node.name] = { data, width: texture.width, height: texture.height, depth: texture.depth };
    }
  }
  return record;
}

/**
 * The compiled callable's return value in one shape. It returns the graph's
 * value directly unless the program writes an output, a position or a fragment
 * depth, and `null` for a discarded fragment.
 */
function readResult<A extends ShaderType>(raw: unknown): EvaluationResult<A> {
  if (raw === null) {
    return { value: null, discarded: true, outputs: {}, varyings: {} };
  }
  if (isProgramResult(raw)) {
    return {
      value: (raw.value ?? null) as ShaderValue<A> | null,
      discarded: false,
      outputs: raw.outputs ?? {},
      varyings: raw.varyings ?? {},
      position: raw.position,
      fragDepth: raw.fragDepth,
    };
  }
  return { value: raw as ShaderValue<A>, discarded: false, outputs: {}, varyings: {} };
}

interface ProgramResult {
  value?: unknown;
  outputs?: Record<string, unknown>;
  varyings?: Record<string, unknown>;
  position?: number[];
  fragDepth?: number;
}

function isProgramResult(raw: unknown): raw is ProgramResult {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}

/**
 * A fragment's four channels. A scalar lights all three colour channels, the
 * way a greyscale value reads; a shorter vector leaves the rest at zero, with
 * an opaque alpha, as a shader writing `vec4(rgb, 1)` would.
 */
function toRGBA(result: EvaluationResult<ShaderType>): [number, number, number, number] {
  const value = result.value ?? onlyOutput(result.outputs);
  if (typeof value === "number") return [value, value, value, 1];
  if (typeof value === "boolean") return value ? [1, 1, 1, 1] : [0, 0, 0, 1];
  if (Array.isArray(value)) {
    const channel = (i: number): number => {
      const component = value[i];
      return typeof component === "boolean" ? (component ? 1 : 0) : (component ?? 0) as number;
    };
    return [channel(0), channel(1), channel(2), value.length > 3 ? channel(3) : 1];
  }
  return [0, 0, 0, 1];
}

/** The written output, when a program wrote exactly one and returned nothing. */
function onlyOutput(outputs: Record<string, unknown>): unknown {
  const written = Object.values(outputs);
  return written.length === 1 ? written[0] : null;
}
