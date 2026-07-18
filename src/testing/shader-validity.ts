/**
 * Checks that every shader the test suite generates is actually valid, in both
 * backends.
 *
 * The suite's assertions are substring matches — `expect(glsl).toContain(...)`
 * — which cannot tell a correct shader from a broken one that happens to
 * contain the expected text. Three real compiler bugs shipped through that gap:
 * `refract(I, N)` still contains "refract(", `lessThan(float, float)` still
 * contains "lessThan(", and a for-loop missing its increment is valid syntax.
 *
 * So the generated source is handed to real compilers instead of being pattern
 * matched. A parser is not enough — it accepts every one of those three, since
 * they are type errors rather than syntax errors:
 *
 *              1e-7.0   refract(I,N)   lessThan(f,f)   mat2x3 = 0.0
 *   parser     reject      accept         accept          accept
 *   real       reject      reject         reject          reject
 *
 * GLSL goes to Chromium's WebGL2 compiler, WGSL to Dawn. Both report type
 * errors, and both are the implementations the output actually has to run on.
 *
 * Wiring: a test file aliases the compilers through `recordGLSL`/`recordWGSL`,
 * so no individual test changes, then awaits `assertRecordedShadersValid()` in
 * `afterAll`.
 */

import { expect } from "vitest";
import { compileGLSL, compileWGSL } from "../rmsl";

export type ShaderLang = "glsl" | "wgsl";
export type ShaderStage = "vertex" | "fragment";

interface Recorded {
  test: string;
  lang: ShaderLang;
  stage: ShaderStage;
  /**
   * Ties the two languages' entries for one program together. A test may
   * compile several programs at the same stage, so test and stage alone do not
   * identify a pair.
   */
  pair: number;
  /** null when the compiler threw rather than producing source. */
  src: string | null;
  compileError?: string;
}

const recorded: Recorded[] = [];
let nextPair = 0;

/**
 * Shaders that are known to be invalid, with the defect that produces them.
 *
 * Keyed `lang:test name`. Entries are asserted to still fail — fixing a bug
 * without removing its entry is itself reported, so the list cannot outlive
 * the problems it documents.
 */
export const KNOWN_INVALID: Record<string, string> = {
};

/**
 * Compile a program to *both* backends, whichever one the test asked for.
 *
 * Coverage had drifted badly: of 69 tests, 48 only ever compiled to GLSL and
 * 20 only to WGSL, so a backend-specific defect stayed invisible unless
 * someone had thought to write the counterpart by hand. Compiling both here
 * makes parity structural — a new test gets it for free — while the test's own
 * assertions still run against the language it chose.
 */
function recordBoth(root: any, stage: ShaderStage, want: ShaderLang): string {
  const test = expect.getState().currentTestName ?? "<unknown test>";
  const pair = nextPair++;
  const entries: Recorded[] = [];

  for (const [lang, compile] of [
    ["glsl", compileGLSL] as const,
    ["wgsl", compileWGSL] as const,
  ]) {
    const entry: Recorded = { test, lang, stage, pair, src: null };
    try {
      entry.src = stage === "vertex" ? compile.vertex(root) : compile.fragment(root);
    } catch (error) {
      // A backend refusing to compile is itself a signal, so it is recorded
      // rather than swallowed.
      entry.compileError = error instanceof Error ? error.message : String(error);
    }
    entries.push(entry);
    recorded.push(entry);
  }

  // The caller's own compilation is one of these, so it is returned rather than
  // run a third time.
  const wanted = entries.find(e => e.lang === want)!;
  if (wanted.compileError) throw new Error(wanted.compileError);
  return wanted.src!;
}

/** Shape of `compileGLSL` / `compileWGSL`: callable, with vertex/fragment. */
interface Compiler {
  (root: any): string;
  vertex(root: any): string;
  fragment(root: any): string;
}

function wrap(lang: ShaderLang): Compiler {
  return Object.assign(
    (root: any) => recordBoth(root, "fragment", lang),
    {
      vertex: (root: any) => recordBoth(root, "vertex", lang),
      fragment: (root: any) => recordBoth(root, "fragment", lang),
    },
  );
}

/**
 * Drop-in replacements for `compileGLSL` / `compileWGSL`. Each returns the
 * language it is named for, and records both.
 */
export const recordingGLSL = wrap("glsl");
export const recordingWGSL = wrap("wgsl");

/** Compile every recorded GLSL shader in one browser session. */
async function validateGLSL(items: Recorded[]): Promise<(string | null)[]> {
  if (items.length === 0) return [];
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const page = await browser.newPage();
    await page.goto("about:blank");
    return await page.evaluate((list: { src: string; stage: string }[]) => {
      const gl = document.createElement("canvas").getContext("webgl2");
      if (!gl) throw new Error("WebGL2 unavailable in the validation browser");
      return list.map(({ src, stage }) => {
        const shader = gl.createShader(
          stage === "vertex" ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER,
        )!;
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null;
        return (gl.getShaderInfoLog(shader) ?? "").trim().split("\n")[0];
      });
    }, items.map(i => ({ src: i.src!, stage: i.stage })));
  } finally {
    await browser.close();
  }
}

/** Compile every recorded WGSL shader through Dawn. */
async function validateWGSL(items: Recorded[]): Promise<(string | null)[]> {
  if (items.length === 0) return [];
  const { create } = await import("@kmamal/gpu");
  const adapter = await create([]).requestAdapter();
  if (!adapter) throw new Error("No WebGPU adapter for WGSL validation");
  const device = await adapter.requestDevice();

  const results: (string | null)[] = [];
  for (const item of items) {
    device.pushErrorScope("validation");
    device.createShaderModule({ code: item.src! });
    const error = await device.popErrorScope();
    results.push(
      error
        ? error.message.split("\n").find(l => l.includes("error:"))?.trim()
          ?? error.message.split("\n")[0]
        : null,
    );
  }
  return results;
}

/**
 * Validate everything recorded so far and throw a single report if the set of
 * invalid shaders differs from `KNOWN_INVALID` in either direction.
 */
export async function assertRecordedShadersValid(): Promise<void> {
  // Mutation testing reruns the whole suite once per mutant, and launching a
  // browser and a GPU device each time makes that intractable. Skipping is
  // announced rather than silent, so a run without shader checking cannot be
  // mistaken for one with it.
  if (process.env.RMSL_SKIP_SHADER_VALIDATION) {
    console.warn(
      `[shader-validity] SKIPPED — RMSL_SKIP_SHADER_VALIDATION is set.`
      + ` ${recorded.length} shaders were recorded but not compiled.`,
    );
    return;
  }

  // An entry whose compiler threw has no source to hand a validator; it is
  // already accounted for below.
  const glsl = recorded.filter(r => r.lang === "glsl" && r.src !== null);
  const wgsl = recorded.filter(r => r.lang === "wgsl" && r.src !== null);

  const [glslErrors, wgslErrors] = await Promise.all([
    validateGLSL(glsl),
    validateWGSL(wgsl),
  ]);

  const failed = new Map<string, string>();
  for (const entry of recorded) {
    if (!entry.compileError) continue;
    // Both backends refusing a program is consistent, and some tests assert
    // exactly that — builtinFragDepth() in a vertex stage, for one. Only one
    // backend refusing what the other accepts is a gap worth reporting.
    const counterpart = recorded.find(
      r => r.pair === entry.pair && r.lang !== entry.lang,
    );
    if (counterpart?.compileError) continue;
    failed.set(`${entry.lang}:${entry.test}`, `did not compile — ${entry.compileError}`);
  }
  glsl.forEach((item, i) => {
    const e = glslErrors[i];
    if (e) failed.set(`glsl:${item.test}`, e);
  });
  wgsl.forEach((item, i) => {
    const e = wgslErrors[i];
    if (e) failed.set(`wgsl:${item.test}`, e);
  });

  const unexpected = [...failed].filter(([key]) => !(key in KNOWN_INVALID));
  const fixed = Object.keys(KNOWN_INVALID).filter(key => !failed.has(key));

  if (unexpected.length === 0 && fixed.length === 0) return;

  const report: string[] = [
    `Validated ${recorded.length} generated shaders from`
    + ` ${new Set(recorded.map(r => r.test)).size} tests`
    + ` (${glsl.length} GLSL, ${wgsl.length} WGSL).`,
  ];

  if (unexpected.length > 0) {
    report.push("", `${unexpected.length} shader(s) newly invalid:`);
    for (const [key, error] of unexpected) {
      report.push(`  ${describe(key)}\n      ${error}`);
    }
  }

  if (fixed.length > 0) {
    report.push(
      "",
      `${fixed.length} entr(y/ies) in KNOWN_INVALID now compile — delete them from`,
      "src/testing/shader-validity.ts so the list keeps meaning something:",
    );
    for (const key of fixed) report.push(`  ${describe(key)}  [key: ${key}]`);
  }

  throw new Error(report.join("\n"));
}

/**
 * Render a `lang:test` key for reading.
 *
 * Every test's program is compiled to both backends, so a test named for one
 * language routinely fails in the other — "wgsl:… compiles If/Else to GLSL"
 * looks like a contradiction until you know that. Naming the backend as the
 * output being reported, separately from the test, removes the collision.
 */
function describe(key: string): string {
  const separator = key.indexOf(":");
  const lang = key.slice(0, separator).toUpperCase();
  const test = key.slice(separator + 1);
  return `${test}\n      -> invalid ${lang} output`;
}
