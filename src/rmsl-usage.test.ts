import { describe, it, expect } from "vitest";
import {
  Fn, float, vec2, vec3, vec4, int, boolean, mat3, mat4,
  If, For,
  uniform, attribute, varying, output, builtinPosition,
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

  // === Phase 1.1: Comparison ops ===
  it("compiles float lessThan to GLSL", () => {
    let prog = Fn(() => float(1.0).lessThan(float(2.0)).toVar());
    let glsl = compileGLSL(prog());
    expect(glsl).toContain("(1 < 2)");
  });

  it("compiles float lessThan to WGSL", () => {
    let prog = Fn(() => float(1.0).lessThan(float(2.0)).toVar());
    let wgsl = compileWGSL(prog());
    expect(wgsl).toContain("(1f < 2f)");
  });

  it("compiles vec3 lessThan to GLSL (vector path)", () => {
    let prog = Fn(() => vec3(1,2,3).lessThan(vec3(4,5,6)).toVar());
    let glsl = compileGLSL(prog());
    expect(glsl).toContain("lessThan(");
  });

  it("compiles vec3 equal/notEqual to GLSL", () => {
    let prog = Fn(() => vec3(1,2,3).equal(vec3(1,2,3)).toVar());
    let glsl = compileGLSL(prog());
    expect(glsl).toContain("equal(");
  });

  // === Phase 1.2: Texture sampling ===
  it("compiles texture sampling to GLSL", () => {
    let prog = Fn(() => {
      let tex = uniform("sampler2D");
      return tex.texture(vec2(0.5, 0.5)).toVar();
    });
    let glsl = compileGLSL(prog());
    expect(glsl).toContain("uniform sampler2D");
    expect(glsl).toContain("texture(");
  });

  it("compiles texture sampling to WGSL", () => {
    let prog = Fn(() => {
      let tex = uniform("sampler2D");
      return tex.texture(vec2(0.5, 0.5)).toVar();
    });
    let wgsl = compileWGSL(prog());
    expect(wgsl).toContain("texture_2d<f32>");
    expect(wgsl).toContain("textureSample(");
  });

  it("compiles textureLod to GLSL", () => {
    let prog = Fn(() => {
      let tex = uniform("sampler2D");
      return tex.textureLod(vec2(0.5, 0.5), float(0.0)).toVar();
    });
    let glsl = compileGLSL(prog());
    expect(glsl).toContain("textureLod(");
  });

  // === Phase 1.3: Matrix * vec3 ===
  it("compiles mat4 * vec3 with implicit promotion", () => {
    let prog = Fn(() => {
      let m = mat4(1);
      let v = vec3(1, 2, 3);
      return m.multVec(v).toVar();
    });
    let glsl = compileGLSL(prog());
    expect(glsl).toContain("vec4(");
    expect(glsl).toContain(".xyz");
  });

  // === Phase 1.4: Int/Uint comparison ===
  it("compiles int lessThan", () => {
    let prog = Fn(() => int(1).lessThan(int(2)).toVar());
    let glsl = compileGLSL(prog());
    expect(glsl).toContain("(1 < 2)");
  });

  // === Phase 2: Constructor overloads ===
  it("vec3 scalar promotion", () => {
    let prog = Fn(() => vec3(1.0).toVar());
    let glsl = compileGLSL(prog());
    expect(glsl).toContain("vec3(1");
  });

  it("vec3 scalar promotion WGSL", () => {
    let prog = Fn(() => vec3(1.0).toVar());
    let wgsl = compileWGSL(prog());
    expect(wgsl).toContain("vec3<f32>(1");
  });

  it("vec4 from vec3 + scalar", () => {
    let prog = Fn(() => vec4(vec3(1,2,3), 1.0).toVar());
    let glsl = compileGLSL(prog());
    expect(glsl).toContain("vec4(vec3(1, 2, 3), 1");
  });

  it("vec3 from vec4 truncation", () => {
    let prog = Fn(() => vec3(vec4(1,2,3,4)).toVar());
    let glsl = compileGLSL(prog());
    expect(glsl).toContain("vec3(vec4(");
  });

  it("float from int type casting", () => {
    let prog = Fn(() => float(int(5)).toVar());
    let glsl = compileGLSL(prog());
    expect(glsl).toContain("float(5)");
  });

  it("int from float type casting", () => {
    let prog = Fn(() => int(float(3.14)).toVar());
    let glsl = compileGLSL(prog());
    expect(glsl).toContain("int(3");
  });

  it("mat4 scalar constructor", () => {
    let prog = Fn(() => mat4(1.0).toVar());
    let glsl = compileGLSL(prog());
    expect(glsl).toContain("mat4(1");
  });

  it("mat4 scalar constructor WGSL", () => {
    let prog = Fn(() => mat4(1.0).toVar());
    let wgsl = compileWGSL(prog());
    expect(wgsl).toContain("mat4x4<f32>(1");
  });

  // === Phase 3: Compiler Quality ===
  it("compileGLSL.vertex emits gl_Position", () => {
    let prog = Fn(() => {
      let mvp = uniform("mat4");
      let pos = attribute("vec3");
      return mvp.multVec(pos);
    });
    let glsl = compileGLSL.vertex(prog());
    expect(glsl).toContain("gl_Position");
    expect(glsl).toContain("#version 300 es");
  });

  it("compileGLSL.fragment emits output", () => {
    let prog = Fn(() => float(1.0).toVar());
    let glsl = compileGLSL.fragment(prog());
    expect(glsl).toContain("#version 300 es");
  });

  it("compileWGSL.vertex emits @vertex and VertexOutput", () => {
    let prog = Fn(() => vec4(1,2,3,4));
    let wgsl = compileWGSL.vertex(prog());
    expect(wgsl).toContain("@vertex");
    expect(wgsl).toContain("VertexOutput");
    expect(wgsl).toContain("@builtin(position)");
  });

  it("compileWGSL.fragment emits @fragment and FragmentOutput", () => {
    let prog = Fn(() => float(1.0).toVar());
    let wgsl = compileWGSL.fragment(prog());
    expect(wgsl).toContain("@fragment");
    expect(wgsl).toContain("FragmentOutput");
  });

  it("output() creates output variable in GLSL fragment", () => {
    let prog = Fn(() => {
      let outColor = output("vec4");
      outColor.assign(vec4(1,0,0,1));
      return outColor;
    });
    let glsl = compileGLSL.fragment(prog());
    expect(glsl).toContain("layout(location=0)");
    expect(glsl).toContain("out vec4");
  });

  it("output() creates output in WGSL fragment", () => {
    let prog = Fn(() => {
      let outColor = output("vec4");
      outColor.assign(vec4(1,0,0,1));
      return outColor;
    });
    let wgsl = compileWGSL.fragment(prog());
    expect(wgsl).toMatch(/@location\(\d+\)/);
  });

  it("builtinPosition() maps to gl_Position in GLSL vertex", () => {
    let prog = Fn(() => {
      let pos = builtinPosition();
      return pos;
    });
    let glsl = compileGLSL.vertex(prog());
    expect(glsl).toContain("gl_Position");
  });

  it("builtinPosition() maps to position in WGSL vertex", () => {
    let prog = Fn(() => {
      let pos = builtinPosition();
      return pos;
    });
    let wgsl = compileWGSL.vertex(prog());
    expect(wgsl).toContain("position");
  });

  it("varying is out in vertex, in in fragment GLSL", () => {
    let prog = Fn(() => {
      let v = varying("vec3");
      return v.x;
    });
    let vertexGLSL = compileGLSL.vertex(prog());
    let fragmentGLSL = compileGLSL.fragment(prog());
    expect(vertexGLSL).toContain("out vec3");
    expect(fragmentGLSL).toContain("in vec3");
  });

  it("For loop init hoists declaration into for header in GLSL", () => {
    let prog = Fn(() => {
      For(
        () => { let i = int(0).toVar(); },
        () => int(0).lessThan(int(10)),
        () => {},
        () => {},
      );
      return float(1.0);
    });
    let glsl = compileGLSL(prog());
    expect(glsl).toContain("for (int _rmsl_");
  });
});
