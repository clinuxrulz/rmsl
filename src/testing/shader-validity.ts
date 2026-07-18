/**
 * Checks that every shader the test suite generates is actually valid.
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

export type ShaderLang = "glsl" | "wgsl";
export type ShaderStage = "vertex" | "fragment";

interface Recorded {
  test: string;
  lang: ShaderLang;
  stage: ShaderStage;
  src: string;
}

const recorded: Recorded[] = [];

/**
 * Shaders that are known to be invalid, with the defect that produces them.
 *
 * Keyed `lang:test name`. Entries are asserted to still fail — fixing a bug
 * without removing its entry is itself reported, so the list cannot outlive
 * the problems it documents.
 */
export const KNOWN_INVALID: Record<string, string> = {

  // GLSL vector comparisons return bvecN, but RMSL types them Node<"bool">
  // and so declares the variable `bool`.
  "glsl:RMSL > compiles vec3 lessThan to GLSL (vector path)":
    "vector comparison returns bvec3 but is declared bool",
  "glsl:RMSL > compiles vec3 equal/notEqual to GLSL":
    "vector comparison returns bvec3 but is declared bool",

  // Two variables end up sharing a generated name.
  "glsl:RMSL > supports Fn with multiple return values":
    "generated variable name collides: redefinition",
  "glsl:RMSL > types length/distance/dot as float, not the operand type":
    "generated variable name collides: redefinition",

  // Backend-specific gaps, one shader each.
  "wgsl:RMSL > mat4 scalar constructor WGSL":
    "mat4(scalar) has no matching WGSL constructor",
  "wgsl:RMSL > builtinPosition() maps to position in WGSL vertex":
    "builtinPosition emits an unresolved `position` in WGSL",
  "wgsl:RMSL > continue_ compiles in WGSL":
    "continue_ inside For emits a malformed WGSL loop header",
  "wgsl:RMSL > swizzle write via assign works in WGSL":
    "swizzle write targets a value rather than a reference in WGSL",
};

function record(lang: ShaderLang, stage: ShaderStage, src: string): string {
  recorded.push({
    test: expect.getState().currentTestName ?? "<unknown test>",
    lang,
    stage,
    src,
  });
  return src;
}

/** Shape of `compileGLSL` / `compileWGSL`: callable, with vertex/fragment. */
interface Compiler {
  (root: any): string;
  vertex(root: any): string;
  fragment(root: any): string;
}

function wrap(lang: ShaderLang, compile: Compiler): Compiler {
  return Object.assign((root: any) => record(lang, "fragment", compile(root)), {
    vertex: (root: any) => record(lang, "vertex", compile.vertex(root)),
    fragment: (root: any) => record(lang, "fragment", compile.fragment(root)),
  });
}

export const recordGLSL = (compile: Compiler) => wrap("glsl", compile);
export const recordWGSL = (compile: Compiler) => wrap("wgsl", compile);

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
    }, items.map(i => ({ src: i.src, stage: i.stage })));
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
    device.createShaderModule({ code: item.src });
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
  const glsl = recorded.filter(r => r.lang === "glsl");
  const wgsl = recorded.filter(r => r.lang === "wgsl");

  const [glslErrors, wgslErrors] = await Promise.all([
    validateGLSL(glsl),
    validateWGSL(wgsl),
  ]);

  const failed = new Map<string, string>();
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
    `Validated ${recorded.length} generated shaders (${glsl.length} GLSL, ${wgsl.length} WGSL).`,
  ];

  if (unexpected.length > 0) {
    report.push("", `${unexpected.length} shader(s) newly invalid:`);
    for (const [key, error] of unexpected) report.push(`  ${key}\n      ${error}`);
  }

  if (fixed.length > 0) {
    report.push(
      "",
      `${fixed.length} entr(y/ies) in KNOWN_INVALID now compile — delete them from`,
      "src/testing/shader-validity.ts so the list keeps meaning something:",
    );
    for (const key of fixed) report.push(`  ${key}`);
  }

  throw new Error(report.join("\n"));
}
