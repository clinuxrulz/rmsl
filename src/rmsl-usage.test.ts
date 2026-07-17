import { describe, it, expect } from "vitest";
import {
  Fn, float, vec3, vec4, If, For,
  uniform, attribute,
  compileGLSL, compileWGSL,
} from "./rmsl";

describe("RMSL", () => {
  it("compiles a simple float expression to GLSL", () => {
    let prog = Fn(() => {
      let x = float(1.5).toVar();
      let y = float(2.0).toVar();
      let z = x.add(y).toVar();
      return z;
    });
    let glsl = compileGLSL(prog());
    expect(glsl).toContain("#version 300 es");
    expect(glsl).toContain("void main(void)");
    expect(glsl).toContain("float _rmsl_");
  });

  it("compiles a simple float expression to WGSL", () => {
    let prog = Fn(() => float(3.14).toVar());
    let wgsl = compileWGSL(prog());
    expect(wgsl).toContain("fn main()");
    expect(wgsl).toContain("3.14f");
  });

  it("supports uniform declarations", () => {
    let prog = Fn(() => {
      let uTime = uniform("float");
      let uColor = uniform("vec3");
      return uTime.add(uColor.x);
    });
    let glsl = compileGLSL(prog());
    expect(glsl).toContain("uniform float");
    expect(glsl).toContain("uniform vec3");
  });

  it("compiles vec3 swizzles in GLSL", () => {
    let prog = Fn(() => {
      let a = vec3(1, 2, 3).toVar();
      return a.x.toVar();
    });
    let glsl = compileGLSL(prog());
    expect(glsl).toContain("vec3(1, 2, 3)");
    expect(glsl).toContain(".x");
  });

  it("compiles vec3 swizzles in WGSL", () => {
    let prog = Fn(() => vec3(4, 5, 6).xyz.toVar());
    let wgsl = compileWGSL(prog());
    expect(wgsl).toContain("vec3<f32>(4, 5, 6)");
    expect(wgsl).toContain(".xyz");
  });

  it("compiles nested arithmetic", () => {
    let prog = Fn(() => {
      let a = float(10).toVar();
      let b = float(3).toVar();
      return a.div(b).add(float(1)).toVar();
    });
    let glsl = compileGLSL(prog());
    expect(glsl).toContain("/");
    expect(glsl).toContain("+ 1");
  });

  it("supports Fn with multiple return values", () => {
    let prog = Fn(() => {
      let a = float(1.0).toVar();
      let b = float(2.0).toVar();
      return [a, b];
    });
    let [a, b] = prog();
    let glsl = compileGLSL([a, b]);
    expect(glsl).toContain("float _rmsl_");
  });

  it("compiles math built-ins", () => {
    let prog = Fn(() => {
      let x = float(0.5).toVar();
      return x.sin().add(x.cos()).add(x.abs()).toVar();
    });
    let glsl = compileGLSL(prog());
    expect(glsl).toContain("sin(");
    expect(glsl).toContain("cos(");
    expect(glsl).toContain("abs(");
  });

  it("compiles If/Else to GLSL", () => {
    let prog = Fn(() => {
      let x = float(1.0).toVar();
      let cond = uniform("bool");
      If(cond, () => {
        x.assign(float(100.0));
      }).Else(() => {
        x.assign(float(200.0));
      });
      return x;
    });
    let glsl = compileGLSL(prog());
    expect(glsl).toContain("if (");
    expect(glsl).toContain("else {");
  });
});
