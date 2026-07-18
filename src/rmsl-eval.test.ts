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
import { Fn, float, For, If, While, break_, continue_, type Node } from "./rmsl";
import {
  evaluateBoth, closeEvaluators, floatTolerance, EVALUATION_SKIPPED,
} from "./testing/shader-eval";

afterAll(async () => {
  await closeEvaluators();
});

type Build = (...args: Node<"float">[]) => Node<"float">;

/**
 * Assert both backends compute `want`, and therefore agree with each other.
 *
 * The tolerance scales with the magnitude being checked. A flat one fails on
 * correct backends for large results — one unit in the last place at 1024 is
 * already 1.2e-4 — while being far looser than needed near zero.
 */
async function expectValue(build: Build, args: number[], want: number) {
  const { glsl, wgsl } = await evaluateBoth(build, args);
  const tolerance = floatTolerance(want);
  expect(Math.abs(glsl - want), `GLSL computed ${glsl}, wanted ${want}`)
    .toBeLessThan(tolerance);
  expect(Math.abs(wgsl - want), `WGSL computed ${wgsl}, wanted ${want}`)
    .toBeLessThan(tolerance);
  expect(Math.abs(glsl - wgsl), `backends disagree: ${glsl} vs ${wgsl}`)
    .toBeLessThan(tolerance);
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

  // Floored, following GLSL's mod() — the function this operation is named
  // for — so the result takes the sign of the divisor. WGSL's % truncates
  // instead, which agrees only while both operands are positive, and that is
  // the one case a single test would have covered.
  it("computes float modulus the same way on both backends", async () => {
    await expectValue((a, b) => a.mod(b), [7.5, 2], 1.5);
    await expectValue((a, b) => a.mod(b), [-7.5, 2], 0.5);
    await expectValue((a, b) => a.mod(b), [7.5, -2], -0.5);
    await expectValue((a, b) => a.mod(b), [-1, 2], 1);
  }, 60_000);

  // Folding happens in JavaScript, whose % also truncates, so the literal path
  // has to be corrected the same way or an expression changes meaning
  // depending on whether its operands happen to be constants.
  it("folds a modulus to what the shader would have computed", async () => {
    await expectValue(() => float(-7.5).mod(float(2)), [], 0.5);
    await expectValue((a, b) => a.mod(b), [-7.5, 2], 0.5);
  }, 60_000);

  it("folds constants to the same value it would compute at runtime", async () => {
    // The literal path folds in JS; the parameter path runs on the GPU. They
    // must agree, or folding is lying about what the shader would have done.
    await expectValue(() => float(7).div(float(2)), [], 3.5);
    await expectValue((a, b) => a.div(b), [7, 2], 3.5);
  }, 60_000);

  // === Control flow ===
  //
  // These were previously checked by matching the emitted loop header against a
  // regex, which only works if you already know what the bug looks like. A sum
  // pins the whole loop at once: it comes out right only if the loop starts,
  // increments and stops correctly.
  //
  // `toVar()` and `If` need a block scope, which the standalone function
  // compilers do not open, so each body is wrapped in `Fn(() => ...)()`.
  //
  // A loop that fails to advance does not fail — it hangs, and the timeout is
  // what catches it. That is inherent: there is no way to test that a loop
  // terminates without risking one that does not.

  it("runs a for loop the right number of times", async () => {
    const sumTo = (n: Node<"float">) => Fn(() => {
      const total = float(0).toVar();
      For(
        () => float(0).toVar(),
        (i) => i.lessThan(n),
        (i) => i.assign(i.add(1)),
        (i) => { total.assign(total.add(i)); },
      );
      return total;
    })();

    await expectValue(sumTo as any, [5], 10);   // 0+1+2+3+4
    await expectValue(sumTo as any, [10], 45);
    await expectValue(sumTo as any, [0], 0);    // condition false on entry
  }, 60_000);

  it("takes the branch the condition selects", async () => {
    const branch = (x: Node<"float">) => Fn(() => {
      const out = float(0).toVar();
      If(x.greaterThan(1), () => { out.assign(float(10)); })
        .Else(() => { out.assign(float(20)); });
      return out;
    })();

    await expectValue(branch as any, [2], 10);
    await expectValue(branch as any, [0], 20);
  }, 60_000);

  it("walks an if/else-if/else chain in order", async () => {
    const classify = (x: Node<"float">) => Fn(() => {
      const out = float(0).toVar();
      If(x.lessThan(10), () => { out.assign(float(1)); })
        .ElseIf(x.lessThan(20), () => { out.assign(float(2)); })
        .Else(() => { out.assign(float(3)); });
      return out;
    })();

    await expectValue(classify as any, [5], 1);
    await expectValue(classify as any, [15], 2);
    await expectValue(classify as any, [25], 3);
  }, 60_000);

  it("runs a while loop until its condition fails", async () => {
    const countdown = (n: Node<"float">) => Fn(() => {
      const left = n.toVar();
      const steps = float(0).toVar();
      While(left.greaterThan(0), () => {
        left.assign(left.sub(1));
        steps.assign(steps.add(1));
      });
      return steps;
    })();

    await expectValue(countdown as any, [4], 4);
    await expectValue(countdown as any, [0], 0);
  }, 60_000);

  // break_ and continue_ change which iterations contribute, so the sum says
  // whether they landed. continue_ inside a for loop emitted a malformed WGSL
  // header until recently, and nothing checked what it computed.
  it("honours break_ and continue_", async () => {
    const sumUntilBreak = (limit: Node<"float">) => Fn(() => {
      const total = float(0).toVar();
      For(
        () => float(0).toVar(),
        (i) => i.lessThan(100),
        (i) => i.assign(i.add(1)),
        (i) => {
          If(i.greaterThanEqual(limit), () => { break_(); });
          total.assign(total.add(i));
        },
      );
      return total;
    })();

    await expectValue(sumUntilBreak as any, [5], 10);  // stops before i === 5
    await expectValue(sumUntilBreak as any, [1], 0);   // breaks immediately

    const sumSkippingFirst = (n: Node<"float">) => Fn(() => {
      const total = float(0).toVar();
      For(
        () => float(0).toVar(),
        (i) => i.lessThan(n),
        (i) => i.assign(i.add(1)),
        (i) => {
          If(i.lessThan(2), () => { continue_(); });
          total.assign(total.add(i));
        },
      );
      return total;
    })();

    await expectValue(sumSkippingFirst as any, [5], 9);  // 2+3+4, skipping 0,1
  }, 60_000);
});
