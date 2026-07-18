/**
 * Tests for the evaluation harness itself.
 *
 * The harness is what the value assertions rest on, so a fault here is worse
 * than a fault in the compiler: it does not produce a wrong answer, it produces
 * a green run that proves nothing.
 */

import { describe, it, expect, afterAll } from "vitest";
import { runWGSL, closeEvaluators, EVALUATION_SKIPPED } from "./shader-eval";

afterAll(async () => {
  await closeEvaluators();
});

describe.skipIf(EVALUATION_SKIPPED)("WGSL evaluation harness", () => {
  // A failed compile leaves the readback buffer at its zero initialiser, so
  // the harness used to report 0 — a value several tests legitimately expect.
  // That made a broken backend indistinguishable from a correct one.
  it("reports a shader that does not compile instead of returning zero", async () => {
    await expect(
      runWGSL(`@compute @workgroup_size(1) fn main() { this is not wgsl }`),
    ).rejects.toThrow(/WGSL/i);
  }, 60_000);

  // A type error rather than a syntax error: the parser accepts it and only
  // the validator objects, which is the case a parser-based check would miss.
  it("reports a shader that parses but does not type-check", async () => {
    await expect(
      runWGSL(`@group(0) @binding(0) var<storage, read_write> result: array<f32>;
@compute @workgroup_size(1)
fn main() { result[0] = refract(1.0, 2.0); }`),
    ).rejects.toThrow(/WGSL/i);
  }, 60_000);

  it("still reads back the value of a shader that does compile", async () => {
    await expect(
      runWGSL(`@group(0) @binding(0) var<storage, read_write> result: array<f32>;
@compute @workgroup_size(1)
fn main() { result[0] = 42.0; }`),
    ).resolves.toBeCloseTo(42, 4);
  }, 60_000);

  // Zero is the value a failed run used to produce, so it has to be readable
  // as a genuine result.
  it("reads back a genuine zero", async () => {
    await expect(
      runWGSL(`@group(0) @binding(0) var<storage, read_write> result: array<f32>;
@compute @workgroup_size(1)
fn main() { result[0] = 0.0; }`),
    ).resolves.toBe(0);
  }, 60_000);
});
