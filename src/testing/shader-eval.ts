/**
 * Runs a compiled expression and reports the number it produces.
 *
 * The rest of the suite checks that generated shaders *compile*. Nothing
 * checked that they *compute the right answer*, and those are different
 * questions: emitting `a - b` where `a + b` was meant compiles perfectly and
 * passes every text assertion. Mutation testing put a name to the gap — most
 * surviving mutants change what a shader calculates without making it invalid.
 *
 * So an expression is compiled to a function, called on both backends, and the
 * result compared against the same arithmetic in JS. Running both also makes
 * the backends checkable against each other: one RMSL program must produce one
 * number, and a divergence is a bug in whichever side disagrees with JS.
 *
 * GLSL renders to an RGBA32F texture and reads the red channel; WGSL dispatches
 * a compute shader and reads a storage buffer. Both return exact f32, so the
 * only tolerance needed is for f32 against JS's f64.
 */

import {
  compileGLSLFn, compileWGSLFn, type Node,
} from "../rmsl";

// Written to rather than console.warn: vitest intercepts console output and
// does not surface it here, so a warning sent that way is not seen at all.
declare const process: {
  env: Record<string, string | undefined>;
  stderr: { write(message: string): void };
};

/**
 * Difference allowed between two results of the same magnitude.
 *
 * A 32-bit float carries 24 bits of mantissa, so neighbouring representable
 * values at |x| are about |x| * 2^-23 apart — at 1024 that is 1.2e-4, larger
 * than any flat tolerance worth using. Two independent implementations are not
 * obliged to agree bit for bit: `pow` is commonly evaluated as
 * exp2(y * log2(x)) and lands a unit or two either side, so a fixed allowance
 * either fails on correct backends at large magnitudes or waves through real
 * mistakes at small ones.
 *
 * Scaling with magnitude gives roughly eight units in the last place, with a
 * floor for values near zero where the relative gap collapses.
 */
export function floatTolerance(magnitude: number): number {
  return Math.max(1e-6, Math.abs(magnitude) * 1e-6);
}

type Build = (...args: Node<"float">[]) => Node<"float">;

function params(count: number) {
  return Array.from({ length: count }, (_, i) => ({ name: `a${i}`, type: "float" as const }));
}

function callExpr(args: number[]) {
  // Emitted as literals. Whether the driver folds them is immaterial: if the
  // wrong operator was emitted the answer is wrong either way.
  return `rmsl_eval(${args.map(a => (Number.isInteger(a) ? a.toFixed(1) : String(a))).join(", ")})`;
}

// One browser and one GPU device for the whole run; creating either per call
// costs far more than the dispatch.
let browser: any;
let device: any;

async function glslDevice() {
  if (!browser) {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({
      args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
    });
  }
  return browser;
}

async function wgslDevice() {
  if (!device) {
    const { create } = await import("@kmamal/gpu");
    const adapter = await create([]).requestAdapter();
    if (!adapter) throw new Error("No WebGPU adapter for shader evaluation");
    device = await adapter.requestDevice();
  }
  return device;
}

/** Compile, run and read back one float from the GLSL backend. */
export async function evaluateGLSL(build: Build, args: number[] = []): Promise<number> {
  const fn = compileGLSLFn(build as any, { name: "rmsl_eval", params: params(args.length) });
  const source = `#version 300 es
precision highp float;
${fn}
layout(location=0) out vec4 result;
void main() { result = vec4(${callExpr(args)}, 0.0, 0.0, 1.0); }`;

  const page = await (await glslDevice()).newPage();
  try {
    await page.goto("about:blank");
    return await page.evaluate((fragment: string) => {
      const gl = document.createElement("canvas").getContext("webgl2")!;
      if (!gl.getExtension("EXT_color_buffer_float")) {
        throw new Error("EXT_color_buffer_float unavailable; cannot read float output");
      }
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, null);
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

      // Compiled inline rather than through a helper: the bundler renames
      // functions and injects a `__name` shim that does not exist in the page.
      const program = gl.createProgram()!;
      for (const [src, type] of [
        [`#version 300 es\nin vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`, gl.VERTEX_SHADER],
        [fragment, gl.FRAGMENT_SHADER],
      ] as [string, number][]) {
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          throw new Error(gl.getShaderInfoLog(shader) ?? "shader failed to compile");
        }
        gl.attachShader(program, shader);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) ?? "program failed to link");
      }
      gl.useProgram(program);

      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const location = gl.getAttribLocation(program, "p");
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);

      gl.viewport(0, 0, 1, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const out = new Float32Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, out);
      return out[0];
    }, source);
  } finally {
    await page.close();
  }
}

/** Compile, run and read back one float from the WGSL backend. */
export async function evaluateWGSL(build: Build, args: number[] = []): Promise<number> {
  const fn = compileWGSLFn(build as any, { name: "rmsl_eval", params: params(args.length) });
  return runWGSL(`${fn}
@group(0) @binding(0) var<storage, read_write> result: array<f32>;
@compute @workgroup_size(1)
fn main() { result[0] = ${callExpr(args)}; }`);
}

/**
 * Run a compute shader that writes one float to `result[0]`, and read it back.
 *
 * Separate from `evaluateWGSL` so the execution path can be exercised with
 * source the compiler would never produce, which is the only way to check that
 * a shader failing to compile is actually reported.
 */
export async function runWGSL(code: string): Promise<number> {
  const gpu = await wgslDevice();

  // A shader that fails to compile is reported as an uncaptured device error
  // rather than an exception: the pipeline, the dispatch and the copy that
  // follow are all quietly invalid, and the readback buffer is handed back
  // still holding its zero initialiser. Reading that as a result means a
  // completely broken backend returns 0, which is a value the evaluation tests
  // legitimately expect in several places — so the failure has to be caught
  // here or it reads as a pass.
  gpu.pushErrorScope("validation");
  const module = gpu.createShaderModule({ code });
  const pipeline = gpu.createComputePipeline({
    layout: "auto",
    compute: { module, entryPoint: "main" },
  });
  const failure = await gpu.popErrorScope();
  if (failure) {
    let detail = failure.message.split("\n").find((l: string) => l.includes("error:"))
      ?? failure.message.split("\n")[0];
    throw new Error(`WGSL shader failed to compile: ${detail.trim()}`);
  }

  const STORAGE = 0x80, COPY_SRC = 0x4, MAP_READ = 0x1, COPY_DST = 0x8;
  const storage = gpu.createBuffer({ size: 4, usage: STORAGE | COPY_SRC });
  const readback = gpu.createBuffer({ size: 4, usage: MAP_READ | COPY_DST });
  try {
    const encoder = gpu.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, gpu.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: storage } }],
    }));
    pass.dispatchWorkgroups(1);
    pass.end();
    encoder.copyBufferToBuffer(storage, 0, readback, 0, 4);
    gpu.queue.submit([encoder.finish()]);
    await readback.mapAsync(MAP_READ);
    return new Float32Array(readback.getMappedRange())[0];
  } finally {
    readback.destroy?.();
    storage.destroy?.();
  }
}

/**
 * Run an expression on both backends.
 *
 * Comparing the two against each other is the part text assertions cannot do:
 * one RMSL program has one meaning, so any disagreement is a defect in
 * whichever backend differs from the arithmetic the caller expected.
 */
export async function evaluateBoth(
  build: Build,
  args: number[] = [],
): Promise<{ glsl: number; wgsl: number }> {
  const [glsl, wgsl] = await Promise.all([
    evaluateGLSL(build, args),
    evaluateWGSL(build, args),
  ]);
  return { glsl, wgsl };
}

/** Release the browser and the GPU device held open across evaluations. */
export async function closeEvaluators(): Promise<void> {
  if (browser) { await browser.close(); browser = undefined; }
  // The device holds native resources; leaving it open kept them alive for the
  // rest of the process even though nothing could reach it any more.
  if (device) { device.destroy?.(); device = undefined; }
}

/**
 * Whether to skip the evaluation tests.
 *
 * Evaluation needs a GPU, and validation needs a browser, so both are worth
 * skipping in a mutation run. They are separate switches because they check
 * separate things: `RMSL_SKIP_GPU` turns off both, and each layer has its own
 * flag for turning off just that one.
 *
 * Skipping is announced. This layer is the only thing checking what a shader
 * computes rather than whether it compiles, so a run without it silently
 * proves much less than it appears to.
 */
export const EVALUATION_SKIPPED =
  !!process.env.RMSL_SKIP_GPU || !!process.env.RMSL_SKIP_SHADER_EVALUATION;

if (EVALUATION_SKIPPED) {
  process.stderr.write(
    "\n[shader-eval] SKIPPED — nothing is checking what the shaders compute,"
    + " only that they compile.\n",
  );
}
