/**
 * Checks what the generated shaders *compute*, not just that they compile.
 *
 * Every other test asserts on emitted text, and text cannot tell `a + b` from
 * `a - b` — both are valid, and both contain whatever the assertion looks for.
 * Mutation testing named the gap: most surviving mutants change the arithmetic
 * without making the shader invalid.
 *
 * Concretely, replacing `min` with `max` in the GLSL emitter leaves all 130
 * text-based tests passing and the shader valid. It is caught here.
 *
 * Each expression is run on both backends, so the two are also checked against
 * each other. One RMSL program has one meaning, and a disagreement identifies
 * which backend is wrong without anyone having to write down the expected
 * output text.
 *
 * Operands come in as function parameters rather than literals, since constant
 * folding would otherwise compute the answer before codegen ever runs — which
 * is exactly how the min/max case escaped notice.
 */

import { describe, it, expect, afterAll } from "vitest";
import { float, type Node } from "./rmsl";
import {
  evaluateBoth, closeEvaluators, FLOAT_TOLERANCE, EVALUATION_SKIPPED,
} from "./testing/shader-eval";

afterAll(async () => {
  await closeEvaluators();
});

type Build = (...args: Node<"float">[]) => Node<"float">;

/** Assert both backends compute `want`, and therefore agree with each other. */
async function expectValue(build: Build, args: number[], want: number) {
  const { glsl, wgsl } = await evaluateBoth(build, args);
  expect(glsl, "GLSL result").toBeCloseTo(want, 4);
  expect(wgsl, "WGSL result").toBeCloseTo(want, 4);
  expect(Math.abs(glsl - wgsl), "backends disagree").toBeLessThan(FLOAT_TOLERANCE);
}

describe.skipIf(EVALUATION_SKIPPED)("RMSL evaluation", () => {
  it("computes arithmetic", async () => {
    await expectValue((a, b) => a.add(b), [2, 3], 5);
    await expectValue((a, b) => a.sub(b), [7, 3], 4);
    await expectValue((a, b) => a.mult(b), [3, 4], 12);
    await expectValue((a, b) => a.div(b), [8, 2], 4);
    await expectValue((a) => a.negate(), [3], -3);
  }, 60_000);

  // The pair that motivated this file: swapping them is invisible to text.
  it("computes min and max the right way round", async () => {
    await expectValue((a, b) => a.min(b), [3, 9], 3);
    await expectValue((a, b) => a.max(b), [3, 9], 9);
  }, 60_000);

  it("computes math builtins", async () => {
    await expectValue((a) => a.sqrt(), [9], 3);
    await expectValue((a) => a.abs(), [-4], 4);
    await expectValue((a) => a.floor(), [2.7], 2);
    await expectValue((a) => a.ceil(), [2.1], 3);
    await expectValue((a) => a.sin(), [0.5], Math.sin(0.5));
    await expectValue((a) => a.cos(), [0.5], Math.cos(0.5));
    await expectValue((a, b) => a.pow(b), [2, 10], 1024);
  }, 60_000);

  // Argument order is the thing worth pinning: GLSL takes the value last in
  // step(edge, x), so an emitter that passes them the other way still compiles.
  it("computes step, smoothstep and mix with operands in the right order", async () => {
    await expectValue((a, b) => b.step(a), [0.5, 2], 1);   // x above edge -> 1
    await expectValue((a, b) => b.step(a), [2, 0.5], 0);   // x below edge -> 0
    await expectValue((a, b) => a.mix(b, 0.25), [0, 4], 1);
    await expectValue((a, b) => a.mix(b, 0.75), [0, 4], 3);
    await expectValue((a) => a.smoothstep(0, 1), [0.5], 0.5);
  }, 60_000);

  it("computes clamp against both bounds", async () => {
    await expectValue((a) => a.clamp(0, 1), [2.5], 1);
    await expectValue((a) => a.clamp(0, 1), [-2.5], 0);
    await expectValue((a) => a.clamp(0, 1), [0.25], 0.25);
  }, 60_000);

  // mod is emitted as `%` for integers and mod() for floats in GLSL, and `%`
  // in WGSL; the backends have to land on the same number regardless.
  it("computes float modulus consistently across backends", async () => {
    await expectValue((a, b) => a.mod(b), [7.5, 2], 1.5);
  }, 60_000);

  it("folds constants to the same value it would compute at runtime", async () => {
    // The literal path folds in JS; the parameter path runs on the GPU. They
    // must agree, or folding is lying about what the shader would have done.
    await expectValue(() => float(7).div(float(2)), [], 3.5);
    await expectValue((a, b) => a.div(b), [7, 2], 3.5);
  }, 60_000);
});
