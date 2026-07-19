/**
 * Type-level tests.
 *
 * Several defects in this compiler were mismatches between what a signature
 * promised and what the node actually was — a comparison declared as returning
 * a single boolean while building a boolean vector, a reducing operation
 * declared as float while carrying its operand's type. Those are invisible to
 * a runtime assertion, so they are pinned here instead.
 *
 * Run by `pnpm test:types`, and also checked by `pnpm type-check`.
 */

import { describe, it, expectTypeOf } from "vitest";
import {
  float, vec2, vec3, vec4, int, uniform, mat3, mat4, type Node,
} from "./rmsl";

describe("comparison result types", () => {
  // Only a scalar reduces to a single boolean; a comparison is component-wise,
  // so a vector yields one boolean per component.
  it("reduces to bool for scalars and to a boolean vector otherwise", () => {
    expectTypeOf(float(1).lessThan(float(2))).toEqualTypeOf<Node<"bool">>();
    expectTypeOf(vec2(1, 2).lessThan(vec2(3, 4))).toEqualTypeOf<Node<"bvec2">>();
    expectTypeOf(vec3(1, 2, 3).lessThan(vec3(4, 5, 6))).toEqualTypeOf<Node<"bvec3">>();
    expectTypeOf(vec4(1, 2, 3, 4).lessThan(vec4(5, 6, 7, 8))).toEqualTypeOf<Node<"bvec4">>();
    expectTypeOf(int(1).lessThan(int(2))).toEqualTypeOf<Node<"bool">>();
  });

  // A vector against a scalar broadcasts, which is what the caller means.
  it("allows a vector compared against a scalar", () => {
    expectTypeOf(vec3(1, 2, 3).lessThan(uniform("float"))).toEqualTypeOf<Node<"bvec3">>();
    expectTypeOf(vec3(1, 2, 3).greaterThan(0.5)).toEqualTypeOf<Node<"bvec3">>();
  });

  // The reverse has no single answer. The compiler widens the scalar and
  // produces a boolean vector, so a signature promising `bool` would be lying.
  it("rejects a scalar compared against a vector", () => {
    // @ts-expect-error a float has no single comparison against a vec3
    float(1).lessThan(vec3(1, 2, 3));
    // @ts-expect-error a float has no single comparison against a vec4
    uniform("float").greaterThanEqual(vec4(1, 2, 3, 4));
  });
});

describe("boolean vector reduction", () => {
  it("reduces to a single bool, and negates component-wise", () => {
    const compared = vec3(1, 2, 3).lessThan(vec3(4, 5, 6));
    expectTypeOf(compared.all()).toEqualTypeOf<Node<"bool">>();
    expectTypeOf(compared.any()).toEqualTypeOf<Node<"bool">>();
    expectTypeOf(compared.not()).toEqualTypeOf<Node<"bvec3">>();
  });
});

describe("operations whose result is not their operand's type", () => {
  // These reduce a vector to a scalar. Getting this wrong sent float
  // comparisons down the vector path and emitted lessThan(float, float).
  it("types length, dot and distance as float", () => {
    expectTypeOf(vec3(1, 2, 3).length()).toEqualTypeOf<Node<"float">>();
    expectTypeOf(vec3(1, 2, 3).dot(vec3(4, 5, 6))).toEqualTypeOf<Node<"float">>();
    expectTypeOf(vec2(3, 4).distance(vec2(0, 0))).toEqualTypeOf<Node<"float">>();
  });

  // A matrix column, not a matrix.
  it("types a matrix element as the column vector it is", () => {
    expectTypeOf(uniform("mat4").element(0)).toEqualTypeOf<Node<"vec4">>();
    expectTypeOf(uniform("mat3").element(0)).toEqualTypeOf<Node<"vec3">>();
  });
});

describe("operations whose value operand is not the first", () => {
  // GLSL takes the value last in step(edge, x), so the result follows the
  // value rather than the edge — vec3.step(0.5) is a vec3, not a float.
  it("types step and smoothstep from the value", () => {
    expectTypeOf(vec3(1, 2, 3).step(0.5)).toEqualTypeOf<Node<"vec3">>();
    expectTypeOf(vec3(1, 2, 3).smoothstep(0, 1)).toEqualTypeOf<Node<"vec3">>();
    expectTypeOf(float(1).step(0.5)).toEqualTypeOf<Node<"float">>();
  });
});

describe("declared variables", () => {
  // A uniform carries its type's operations directly, alongside its name.
  it("carries both a name and the operations of its type", () => {
    expectTypeOf(uniform("vec3").name).toEqualTypeOf<string>();
    expectTypeOf(uniform("vec3").x).toEqualTypeOf<Node<"float">>();
    expectTypeOf(uniform("vec3").normalize()).toEqualTypeOf<Node<"vec3">>();
    expectTypeOf(uniform("mat4").mult(vec4(1, 2, 3, 4))).toEqualTypeOf<Node<"vec4">>();
  });
});
