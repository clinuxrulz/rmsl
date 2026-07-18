import { describe, it, expect, afterAll } from "vitest";
import {
  Fn, float, vec2, vec3, vec4, int, boolean,
  mat2, mat2x3, mat2x4, mat3, mat3x2, mat3x4, mat4, mat4x2, mat4x3,
  If, For, While, discard, break_, continue_,
  uniform, attribute, varying, output, builtinPosition, builtinFragDepth,
  isUniformNode, isAttributeNode, isVaryingNode,
  compileGLSLFn, compileWGSLFn, uniformRaw,
} from "./rmsl";
// Recording stand-ins for the real compilers: each returns the language it is
// named for and additionally compiles the program to the other, so every shader
// the tests generate is checked by a real GLSL and WGSL implementation in the
// afterAll below. Aliasing at the import means the tests need no changes; see
// src/testing/shader-validity.ts for why substring assertions were not enough.
import {
  recordingGLSL as compileGLSL,
  recordingWGSL as compileWGSL,
  recordShaderSource,
  assertRecordedShadersValid,
} from "./testing/shader-validity";

afterAll(async () => {
  await assertRecordedShadersValid();
}, 120_000);


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

  it("uniform nodes have .name property", () => {
    let uTime = uniform("float");
    let uColor = uniform("vec3");
    let uMVP = uniform("mat4");
    expect(uTime.name).toMatch(/^_rmsl_u\d+$/);
    expect(uColor.name).toMatch(/^_rmsl_u\d+$/);
    expect(uMVP.name).toMatch(/^_rmsl_u\d+$/);
  });

  it("attribute nodes have .name property", () => {
    let pos = attribute("vec3");
    let tex = attribute("vec2");
    expect(pos.name).toBe("_rmsl_a0");
    expect(tex.name).toBe("_rmsl_a1");
  });

  it("varying nodes have .name property", () => {
    let v = varying("vec3");
    expect(v.name).toBe("_rmsl_v0");
  });

  it("type guards work for uniform nodes", () => {
    let u = uniform("float");
    expect(isUniformNode(u)).toBe(true);
    expect(isAttributeNode(u)).toBe(false);
    expect(isVaryingNode(u)).toBe(false);
  });

  it("type guards work for attribute nodes", () => {
    let a = attribute("vec3");
    expect(isAttributeNode(a)).toBe(true);
    expect(isUniformNode(a)).toBe(false);
    expect(isVaryingNode(a)).toBe(false);
  });

  it("type guards work for varying nodes", () => {
    let v = varying("vec3");
    expect(isVaryingNode(v)).toBe(true);
    expect(isUniformNode(v)).toBe(false);
    expect(isAttributeNode(v)).toBe(false);
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
    expect(glsl).toContain("(1.0 < 2.0)");
  });

  it("compiles float lessThan to WGSL", () => {
    let prog = Fn(() => float(1.0).lessThan(float(2.0)).toVar());
    let wgsl = compileWGSL(prog());
    expect(wgsl).toContain("(1f < 2f)");
  });

  // Comparing vectors gives one boolean per component, so the result is a
  // bvecN rather than a bool. GLSL spells it with a function; WGSL uses the
  // operator directly. Both yield a boolean vector.
  it("compiles vec3 lessThan to GLSL (vector path)", () => {
    let prog = Fn(() => vec3(1,2,3).lessThan(vec3(4,5,6)).toVar());
    let glsl = compileGLSL(prog());
    expect(glsl).toContain("lessThan(");
    expect(glsl).toContain("bvec3 ");
  });

  it("compiles vec3 lessThan to WGSL (vector path)", () => {
    let prog = Fn(() => vec3(1,2,3).lessThan(vec3(4,5,6)).toVar());
    let wgsl = compileWGSL(prog());
    expect(wgsl).toContain("vec3<bool>");
  });

  it("compiles vec3 equal/notEqual to GLSL", () => {
    let prog = Fn(() => vec3(1,2,3).equal(vec3(1,2,3)).toVar());
    let glsl = compileGLSL(prog());
    expect(glsl).toContain("equal(");
    expect(glsl).toContain("bvec3 ");
  });

  it("reduces a boolean vector with all()/any() in GLSL", () => {
    let prog = Fn(() => [
      vec3(1,2,3).lessThan(vec3(4,5,6)).all().toVar(),
      vec3(1,2,3).greaterThan(vec3(4,5,6)).any().toVar(),
    ]);
    let [a, b] = prog() as any;
    let glsl = compileGLSL([a, b]);
    expect(glsl).toContain("all(lessThan(");
    expect(glsl).toContain("any(greaterThan(");
    expect(glsl).toContain("bool ");
  });

  it("reduces a boolean vector with all()/any() in WGSL", () => {
    let prog = Fn(() => vec3(1,2,3).lessThan(vec3(4,5,6)).all().toVar());
    let wgsl = compileWGSL(prog());
    expect(wgsl).toContain("all(");
    expect(wgsl).toContain(": bool");
  });

  // GLSL's `!` is scalar-only, so negating a boolean vector needs not().
  it("negates a boolean vector component-wise in both backends", () => {
    let prog = Fn(() => vec3(1,2,3).lessThan(vec3(4,5,6)).not().toVar());
    expect(compileGLSL(prog())).toContain("not(lessThan(");
    expect(compileWGSL(prog())).toContain("(!(");
  });

  // refract(I, N, eta) takes three arguments; routing it through the binary
  // emitter silently dropped eta and produced a two-argument call.
  it("compiles refract with all three arguments to GLSL", () => {
    let prog = Fn(() => vec3(1,0,0).refract(vec3(0,1,0), 0.5).toVar());
    let glsl = compileGLSL(prog());
    expect(glsl).toContain("refract(vec3(1, 0, 0), vec3(0, 1, 0), 0.5)");
  });

  it("compiles refract with all three arguments to WGSL", () => {
    let prog = Fn(() => vec3(1,0,0).refract(vec3(0,1,0), 0.5).toVar());
    let wgsl = compileWGSL(prog());
    expect(wgsl).toContain("refract(vec3<f32>(1, 0, 0), vec3<f32>(0, 1, 0), 0.5f)");
  });

  // The update clause arrives as statements, so its work sits in `body` while
  // `expr` holds only a bare variable reference. Emitting `expr` alone dropped
  // the increment and produced `for (float i = 0.0; (i < 4.0); i)` — an
  // infinite loop that hangs the GPU.
  it("emits the for-loop update clause in GLSL", () => {
    let prog = Fn(() => {
      let total = float(0).toVar();
      For(
        () => float(0).toVar(),
        (i) => i.lessThan(4),
        (i) => i.assign(i.add(1)),
        (i) => { total.assign(total.add(i)); },
      );
      return total;
    });
    let glsl = compileGLSL(prog());
    let header = glsl.split("\n").find(l => l.includes("for ("))!;
    expect(header).toMatch(/;\s*(\S+) = \(\1 \+ 1\.0\)\) \{$/);
  });

  it("emits the for-loop update clause in WGSL", () => {
    let prog = Fn(() => {
      let total = float(0).toVar();
      For(
        () => float(0).toVar(),
        (i) => i.lessThan(4),
        (i) => i.assign(i.add(1)),
        (i) => { total.assign(total.add(i)); },
      );
      return total;
    });
    let wgsl = compileWGSL(prog());
    let header = wgsl.split("\n").find(l => l.includes("for ("))!;
    expect(header).toMatch(/;\s*(\S+) = \(\1 \+ 1f\)\) \{$/);
  });

  // dot/length/distance reduce a vector to a scalar. Typing the node after its
  // first operand left `_t` as "vec2", which sent float comparisons down the
  // vector path and emitted `lessThan(float, float)` — no such GLSL overload.
  it("types length/distance/dot as float, not the operand type", () => {
    let prog = Fn(() => {
      let a = vec2(3, 4).toVar();
      return [a.length().toVar(), a.distance(vec2(0, 0)).toVar(), a.dot(vec2(1, 1)).toVar()];
    });
    let glsl = compileGLSL(prog());
    expect(glsl).toContain("float");
    expect(glsl).not.toMatch(/vec2 \S+ = length\(/);
    expect(glsl).not.toMatch(/vec2 \S+ = distance\(/);
    expect(glsl).not.toMatch(/vec2 \S+ = dot\(/);
  });

  it("compares a distance against a float with an operator, not lessThan()", () => {
    let prog = Fn(() => vec2(3, 4).distance(vec2(0, 0)).lessThan(5.0).toVar());
    let glsl = compileGLSL(prog());
    expect(glsl).toContain("< 5.0");
    expect(glsl).not.toContain("lessThan(");
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

  // A plain JS number has no shader type of its own. Typing it as float beside
  // an integer operand made the operands disagree, so codegen inserted a
  // conversion and produced `int x = (float(u) % 2.0)` — a float expression
  // assigned to an int. A uniform is used because constants fold away.
  it("gives a plain number the operand's integer type", () => {
    let prog = Fn(() => uniform("int").mod(2).toVar());
    let glsl = compileGLSL(prog());
    expect(glsl).toMatch(/int \S+ = \(\S+ % 2\);/);
    expect(glsl).not.toContain("float(");
    expect(compileWGSL(prog())).toMatch(/var \S+: i32 = \(\S+ % 2i\);/);
  });

  it("keeps float literals float", () => {
    let prog = Fn(() => uniform("float").add(2).toVar());
    expect(compileGLSL(prog())).toContain("+ 2.0");
    expect(compileWGSL(prog())).toContain("+ 2f");
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
      // gl_Position is a vec4, so the stage result has to be one too.
      return vec4(mvp.multVec(pos), 1.0);
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
    // The struct only appears when there is something to return, so the stage
    // result has to be a vec4 for the implicit colour output to be emitted.
    let prog = Fn(() => vec4(1.0, 0.0, 0.0, 1.0).toVar());
    let wgsl = compileWGSL.fragment(prog());
    expect(wgsl).toContain("@fragment");
    expect(wgsl).toContain("FragmentOutput");
    expect(wgsl).toContain("_rmsl_fragColor");
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

  it("builtinFragDepth() maps to gl_FragDepth in GLSL fragment", () => {
    let prog = Fn(() => {
      let fd = builtinFragDepth();
      fd.assign(float(0.5));
      return float(1.0);
    });
    let glsl = compileGLSL.fragment(prog());
    expect(glsl).toContain("gl_FragDepth");
    expect(glsl).toContain("gl_FragDepth = 0.5");
  });

  it("builtinFragDepth() maps to @builtin(frag_depth) in WGSL fragment", () => {
    let prog = Fn(() => {
      let fd = builtinFragDepth();
      fd.assign(float(0.5));
      return float(1.0);
    });
    let wgsl = compileWGSL.fragment(prog());
    expect(wgsl).toContain("@builtin(frag_depth)");
    expect(wgsl).toContain("_rmsl_fragDepth = 0.5");
  });

  it("builtinFragDepth() throws in vertex shader", () => {
    let prog = Fn(() => {
      let fd = builtinFragDepth();
      return fd;
    });
    expect(() => compileGLSL.vertex(prog())).toThrow("builtinFragDepth");
    expect(() => compileWGSL.vertex(prog())).toThrow("builtinFragDepth");
  });

  it("varying is out in vertex, in in fragment GLSL", () => {
    let prog = Fn(() => {
      let v = varying("vec3");
      // A vertex shader's result is its position, so it has to be a vec4.
      return vec4(v.x, v.y, v.z, 1.0);
    });
    let vertexGLSL = compileGLSL.vertex(prog());
    let fragmentGLSL = compileGLSL.fragment(prog());
    expect(vertexGLSL).toContain("out vec3");
    expect(fragmentGLSL).toContain("in vec3");
  });

  // Skipping the write instead would link cleanly and draw nothing.
  it("rejects a vertex shader whose result is not a vec4", () => {
    let prog = Fn(() => vec3(1, 2, 3).toVar());
    expect(() => compileGLSL.vertex(prog())).toThrow(/vertex shader's result/);
    expect(() => compileWGSL.vertex(prog())).toThrow(/vertex shader's result/);
  });

  // A fragment shader with no colour output is legal, so this stays permitted.
  it("allows a fragment shader with no output", () => {
    let prog = Fn(() => float(3.14).toVar());
    expect(() => compileGLSL.fragment(prog())).not.toThrow();
    expect(compileGLSL.fragment(prog())).toContain("3.14");
  });

  it("For loop init hoists declaration into for header in GLSL", () => {
    let prog = Fn(() => {
      For(
        () => int(0).toVar(),
        (i) => i.lessThan(int(10)),
        (i) => {},
        (i) => {},
      );
      return float(1.0);
    });
    let glsl = compileGLSL(prog());
    expect(glsl).toContain("for (int _rmsl_");
  });

  // === Phase 4: WGSL Polish ===
  it("WGSL vertex has VertexInput struct with attributes", () => {
    let prog = Fn(() => {
      let pos = attribute("vec3");
      let mvp = uniform("mat4");
      // @builtin(position) is a vec4, so the stage result has to be one too.
      return vec4(mvp.multVec(pos), 1.0);
    });
    let wgsl = compileWGSL.vertex(prog());
    expect(wgsl).toContain("struct VertexInput");
    expect(wgsl).toContain("@location(0)");
    expect(wgsl).toMatch(/input\._rmsl_a\d/);
  });

  it("WGSL uniforms use @group(0), textures @group(1), samplers @group(2)", () => {
    let prog = Fn(() => {
      let u = uniform("float");
      let tex = uniform("sampler2D");
      return tex.texture(vec2(0, 0)).add(u);
    });
    let wgsl = compileWGSL.fragment(prog());
    expect(wgsl).toContain("@group(0) @binding(0) var<uniform>");
    expect(wgsl).toContain("@group(1) @binding(0) var ");
    expect(wgsl).toContain("@group(2) @binding(0) var ");
  });

  it("plain number literals are float in WGSL", () => {
    let prog = Fn(() => {
      let x = float(5).toVar();
      return x.mod(2).toVar();
    });
    let wgsl = compileWGSL(prog());
    expect(wgsl).toContain("2f");
    expect(wgsl).not.toContain("f32(");
  });

  // === Phase 5: Node System Gaps ===
  it("swizzle write via assign works in GLSL", () => {
    let prog = Fn(() => {
      let a = vec3(1, 2, 3).toVar();
      let b = vec3(4, 5, 6).toVar();
      a.xy.assign(b.xy);
      return a;
    });
    let glsl = compileGLSL(prog());
    expect(glsl).toContain(".xy = ");
  });

  it("swizzle write via assign works in WGSL", () => {
    let prog = Fn(() => {
      let a = vec3(1, 2, 3).toVar();
      let b = vec3(4, 5, 6).toVar();
      a.xy.assign(b.xy);
      return a;
    });
    let wgsl = compileWGSL(prog());
    // WGSL cannot assign to a multi-component swizzle, so the write is split
    // into one assignment per component.
    expect(wgsl).toContain(".x = ");
    expect(wgsl).toContain(".y = ");
    expect(wgsl).not.toContain(".xy = ");
  });

  it("break_ compiles in GLSL", () => {
    let prog = Fn(() => {
      For(
        () => int(0).toVar(),
        (i) => i.lessThan(int(10)),
        (i) => {},
        (i) => {
          break_();
        },
      );
      return float(1.0);
    });
    let glsl = compileGLSL(prog());
    expect(glsl).toContain("break;");
  });

  it("continue_ compiles in WGSL", () => {
    let prog = Fn(() => {
      For(
        () => int(0).toVar(),
        (i) => i.lessThan(int(10)),
        (i) => {},
        (i) => {
          continue_();
        },
      );
      return float(1.0);
    });
    let wgsl = compileWGSL(prog());
    expect(wgsl).toContain("continue;");
  });

  it("mat2 constructor compiles to GLSL", () => {
    let prog = Fn(() => mat2(1, 0, 0, 1).toVar());
    let glsl = compileGLSL(prog());
    expect(glsl).toContain("mat2(1, 0, 0, 1)");
  });

  it("mat2x3 constructor compiles to GLSL", () => {
    let prog = Fn(() => mat2x3(1,0,0,0,1,0).toVar());
    let glsl = compileGLSL(prog());
    expect(glsl).toContain("mat2x3(");
  });

  // === Phase 6: Infrastructure — Comprehensive coverage ===

  // -- All FloatMathOps (constant-folded with literals) --
  it.each([
    "sin", "cos", "tan", "asin", "acos", "atan",
    "abs", "sign", "floor", "ceil", "fract",
    "sqrt", "inversesqrt", "exp", "log", "exp2", "log2",
  ])("float.%s() compiles to GLSL (constant-folded)", (op) => {
    let prog = Fn(() => (float(0.5) as any)[op]().toVar());
    let glsl = compileGLSL(prog());
    // With constant folding, the result is a literal, not a function call
    expect(glsl).not.toContain(op);
    expect(glsl).toMatch(/_rmsl_\d+ = /);
  });

  it("float.pow() compiles to GLSL (constant-folded)", () => {
    let glsl = compileGLSL(Fn(() => float(2.0).pow(float(3.0)).toVar())());
    expect(glsl).toContain("= 8");
  });

  it("float.min()/max()/mod() compile to GLSL (constant-folded)", () => {
    let glsl1 = compileGLSL(Fn(() => float(5).min(float(3)).toVar())());
    expect(glsl1).toContain("= 3");
    let glsl2 = compileGLSL(Fn(() => float(5).max(float(3)).toVar())());
    expect(glsl2).toContain("= 5");
    let glsl3 = compileGLSL(Fn(() => float(5).mod(float(3)).toVar())());
    expect(glsl3).toContain("= 2");
  });

  // -- VecCommonOps --
  it.each([
    "dot", "length", "normalize", "distance",
  ])("vec3.%s() compiles to GLSL", (op) => {
    let prog = Fn(() => {
      let a = vec3(1,2,3).toVar();
      return (a as any)[op](op === "dot" || op === "distance" ? a : undefined).toVar();
    });
    let glsl = compileGLSL(prog());
    expect(glsl).toContain(op);
  });

  // Neither language compares a vector against a scalar, so the scalar has to
  // be broadcast: GLSL has no lessThan(vec3, float) and WGSL no
  // `operator < (vec3<f32>, f32)`. The signatures accept the mix.
  it("broadcasts a scalar compared against a vector", () => {
    let prog = Fn(() => vec3(1, 2, 3).lessThan(uniform("float")).all().toVar());
    expect(compileGLSL(prog())).toMatch(/lessThan\(vec3\(1, 2, 3\), vec3\(\S+\)\)/);
    expect(compileWGSL(prog())).toMatch(/vec3<f32>\(1, 2, 3\) < vec3<f32>\(\S+\)/);
  });

  // step/smoothstep take the value last, so the result type follows that
  // operand rather than the edge — `vec3.step(0.5)` is a vec3, not a float.
  it("types step/smoothstep from the value, not the edge", () => {
    let stepped = Fn(() => uniform("vec3").step(0.5).toVar());
    let smoothed = Fn(() => uniform("vec3").smoothstep(0.0, 1.0).toVar());
    expect(compileGLSL(stepped())).toMatch(/vec3 \S+ = step\(/);
    expect(compileGLSL(smoothed())).toMatch(/vec3 \S+ = smoothstep\(/);
    expect(compileWGSL(stepped())).toMatch(/var \S+: vec3<f32> = step\(/);
  });

  it("vec3.reflect/refract/clamp/mix/step/smoothstep compile to GLSL", () => {
    let v = vec3(1,2,3);
    let n = vec3(0,1,0);
    expect(compileGLSL(Fn(() => v.reflect(n).toVar())())).toContain("reflect");
    expect(compileGLSL(Fn(() => v.refract(n, float(0.5)).toVar())())).toContain("refract");
    let zero = vec3(0,0,0);
    let one = vec3(1,1,1);
    expect(compileGLSL(Fn(() => v.clamp(zero, one).toVar())())).toContain("clamp");
    expect(compileGLSL(Fn(() => v.mix(one, float(0.5)).toVar())())).toContain("mix");
    expect(compileGLSL(Fn(() => v.step(one).toVar())())).toContain("step");
    expect(compileGLSL(Fn(() => v.smoothstep(one, zero).toVar())())).toContain("smoothstep");
  });

  it("mix/clamp/smoothstep emit 3 args in GLSL", () => {
    let glsl_mix = compileGLSL(Fn(() => vec3(1,0,0).mix(vec3(0,1,0), float(0.5)).toVar())());
    expect(glsl_mix).toContain("mix(");
    expect(glsl_mix).not.toContain("mix(vec3(1, 0, 0), vec3(0, 1, 0))");
    let glsl_clamp = compileGLSL(Fn(() => float(0.5).clamp(float(0), float(1)).toVar())());
    expect(glsl_clamp).toContain("clamp(");
    expect(glsl_clamp).toContain("0.0, 1.0");
    let glsl_ss = compileGLSL(Fn(() => float(0.5).smoothstep(float(0), float(1)).toVar())());
    expect(glsl_ss).toMatch(/smoothstep\(0\.0, 1\.0, 0\.5/);
  });

  it("Fn return type is not void for float expression", () => {
    let prog = Fn(() => {
      let x = float(1.5).toVar();
      return x;
    });
    let result = prog();
    expect((result as any)._t).toBe("float");
  });

  it("vec3.cross compiles to GLSL", () => {
    let glsl = compileGLSL(Fn(() => vec3(1,0,0).cross(vec3(0,1,0)).toVar())());
    expect(glsl).toContain("cross");
  });

  // -- MatOps --
  it("mat3.inverse/transpose compiles to GLSL", () => {
    let m = mat3(1,0,0,0,1,0,0,0,1);
    expect(compileGLSL(Fn(() => m.inverse().toVar())())).toContain("inverse");
    expect(compileGLSL(Fn(() => m.transpose().toVar())())).toContain("transpose");
  });

  it("mat4.inverse/transpose/multVec4 compiles to GLSL", () => {
    let m = mat4(1);
    let v = vec4(1,2,3,4);
    expect(compileGLSL(Fn(() => m.inverse().toVar())())).toContain("inverse");
    expect(compileGLSL(Fn(() => m.transpose().toVar())())).toContain("transpose");
    expect(compileGLSL(Fn(() => m.multVec4(v).toVar())())).toContain("*");
  });

  // -- IntOps --
  it.each([
    ["add", 8], ["sub", 2], ["mult", 15], ["div", 1], ["mod", 2],
  ])("int.%s() compiles to GLSL (constant-folded)", (op, expected) => {
    let prog = Fn(() => (int(5) as any)[op](int(3)).toVar());
    let glsl = compileGLSL(prog());
    expect(glsl).toContain(String(expected));
  });

  it.each([
    ["bitAnd", "&"], ["bitOr", "|"], ["bitXor", "^"], ["shiftLeft", "<<"], ["shiftRight", ">>"],
  ])("int.%s() compiles to GLSL (bitwise)", (op, expected) => {
    let prog = Fn(() => (int(5) as any)[op](int(3)).toVar());
    let glsl = compileGLSL(prog());
    expect(glsl).toContain(expected as string);
  });

  // -- BoolOps --
  it("bool.and/or/not compile to GLSL", () => {
    let t = boolean(true);
    let f = boolean(false);
    expect(compileGLSL(Fn(() => t.and(f).toVar())())).toContain("&&");
    expect(compileGLSL(Fn(() => t.or(f).toVar())())).toContain("||");
    expect(compileGLSL(Fn(() => t.not().toVar())())).toContain("!");
  });

  // -- Type literals --
  it("int/uint/bool/vec2 literals compile to GLSL", () => {
    expect(compileGLSL(Fn(() => int(42).toVar())())).toContain("42");
    expect(compileGLSL(Fn(() => vec2(1,2).toVar())())).toContain("vec2(1, 2)");
  });

  it("int/uint/bool/vec2 literals compile to WGSL", () => {
    expect(compileWGSL(Fn(() => int(42).toVar())())).toContain("42i");
    expect(compileWGSL(Fn(() => vec2(1,2).toVar())())).toContain("vec2<f32>(1, 2)");
  });

  // -- Control flow: While, discard --
  it("While loop compiles to GLSL", () => {
    let prog = Fn(() => {
      let i = int(0).toVar();
      While(i.lessThan(int(5)), () => {
        i.assign(i.add(int(1)));
      });
      return float(1.0);
    });
    let glsl = compileGLSL(prog());
    expect(glsl).toContain("while (");
  });

  it("discard compiles to GLSL", () => {
    let prog = Fn(() => {
      If(boolean(true), () => { discard(); });
      return float(1.0);
    });
    let glsl = compileGLSL(prog());
    expect(glsl).toContain("discard;");
  });

  it("discard compiles to WGSL", () => {
    let prog = Fn(() => {
      If(boolean(true), () => { discard(); });
      return float(1.0);
    });
    let wgsl = compileWGSL(prog());
    expect(wgsl).toContain("discard;");
  });

  // -- Edge cases --
  it("empty Fn does not throw", () => {
    expect(() => { Fn(() => {}); }).not.toThrow();
  });

  it("single-statement Fn compiles", () => {
    expect(() => compileGLSL(Fn(() => float(1.0))())).not.toThrow();
  });

  it("nested Fn compiles", () => {
    let inner = Fn(() => float(2.0));
    let innerVal = inner();
    let outer = Fn(() => innerVal.add(float(1.0)).toVar());
    expect(() => compileGLSL(outer())).not.toThrow();
  });

  // -- Error cases --
  it("assign outside Fn throws", () => {
    let x = float(1.0);
    expect(() => x.assign(float(2.0))).toThrow("assign must be called inside");
  });

  it("toVar outside Fn throws", () => {
    let x = float(1.0);
    expect(() => x.toVar()).toThrow("toVar must be called inside");
  });

  it("If outside Fn throws", () => {
    expect(() => If(boolean(true), () => {})).toThrow("must be called inside");
  });

  // === Standalone function compilers ===
  //
  // compileGLSLFn/compileWGSLFn and uniformRaw were the only exported API with
  // no test at all — the mutation run put 75 uncovered mutants in their shared
  // body. They emit a function rather than a whole shader, so each result is
  // embedded in a minimal shader and validated: the thing worth knowing is that
  // what they produce compiles where it is meant to be used.

  it("compileGLSLFn emits a named function with typed params", () => {
    let glsl = compileGLSLFn((a: any, b: any) => a.add(b).sin(), {
      name: "myFunc",
      params: [{ name: "a", type: "float" }, { name: "b", type: "float" }],
    });
    expect(glsl).toContain("float myFunc(float a, float b)");
    expect(glsl).toContain("return sin((a + b));");

    recordShaderSource("glsl", "fragment", `#version 300 es
precision highp float;
layout(location=0) out vec4 outColor;
${glsl}
void main(void) { outColor = vec4(myFunc(1.0, 2.0)); }`);
  });

  it("compileWGSLFn emits a named function with typed params", () => {
    let wgsl = compileWGSLFn((a: any, b: any) => a.add(b).sin(), {
      name: "myFunc",
      params: [{ name: "a", type: "float" }, { name: "b", type: "float" }],
    });
    expect(wgsl).toContain("fn myFunc(a: f32, b: f32) -> f32");
    expect(wgsl).toContain("return sin((a + b));");

    recordShaderSource("wgsl", "fragment", `${wgsl}
@fragment fn main() -> @location(0) vec4<f32> {
  return vec4<f32>(myFunc(1.0, 2.0));
}`);
  });

  // uniformRaw names its own slot, unlike uniform() which generates one.
  it("uniformRaw declares a custom-named uniform alongside the function", () => {
    let glsl = compileGLSLFn((v: any) => v.mult(uniformRaw("uScale", "float")), {
      name: "scale",
      params: [{ name: "v", type: "float" }],
    });
    expect(glsl).toContain("uniform float uScale;");
    expect(glsl).toContain("float scale(float v)");
    expect(uniformRaw("uOther", "vec3").name).toBe("uOther");

    recordShaderSource("glsl", "fragment", `#version 300 es
precision highp float;
layout(location=0) out vec4 outColor;
${glsl}
void main(void) { outColor = vec4(scale(2.0)); }`);
  });

  it("compileGLSLFn rejects a multi-return function", () => {
    expect(() =>
      compileGLSLFn(() => [float(1), float(2)] as any, { name: "bad", params: [] }),
    ).toThrow(/multi-return/);
  });

  // WGSL has no inverse() builtin, so the compiler writes one out on demand.
  // The whole-shader path emits the helpers it collected; this path collected
  // them into the same set and then dropped them, leaving a call to a function
  // that was never defined.
  it("compileWGSLFn emits the helpers the function body calls", () => {
    let wgsl = compileWGSLFn((m: any) => m.inverse(), {
      name: "invert",
      params: [{ name: "m", type: "mat4" }],
    });
    expect(wgsl).toContain("_rmsl_inverse4(m)");
    expect(wgsl).toContain("fn _rmsl_inverse4(");

    recordShaderSource("wgsl", "fragment", `${wgsl}
@fragment fn main() -> @location(0) vec4<f32> {
  return invert(mat4x4<f32>(1f, 0f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 0f, 1f))[0];
}`);
  });

  it("compileWGSLFn emits the mat3 helper for a mat3 operand", () => {
    let wgsl = compileWGSLFn((m: any) => m.inverse(), {
      name: "invert3",
      params: [{ name: "m", type: "mat3" }],
    });
    expect(wgsl).toContain("fn _rmsl_inverse3(");
    expect(wgsl).not.toContain("fn _rmsl_inverse4(");
  });

  // === Breadth coverage ===
  //
  // The mutation run showed these reached by no test at all. They are exported
  // API, and going through the recording compilers means both backends are
  // checked by a real implementation as well as by the assertion.

  // Driven by a uniform because constant folding collapses these on literals,
  // which is how they avoided being exercised in the first place.
  it("compiles every unary math builtin", () => {
    let ops = [
      "sin", "cos", "tan", "asin", "acos", "atan", "abs", "sign",
      "floor", "ceil", "fract", "sqrt", "inversesqrt",
      "exp", "log", "exp2", "log2",
    ] as const;
    for (let op of ops) {
      let prog = Fn(() => (uniform("float") as any)[op]().toVar());
      expect(compileGLSL(prog()), op).toContain(op + "(");
      // Names differ between backends (inversesqrt vs inverseSqrt), so WGSL is
      // left to the validator rather than matched on text.
      expect(() => compileWGSL(prog()), op).not.toThrow();
    }
  });

  it("compiles every matrix type, including the non-square ones", () => {
    let cases: [string, any, number][] = [
      ["mat2", mat2, 4], ["mat2x3", mat2x3, 6], ["mat2x4", mat2x4, 8],
      ["mat3x2", mat3x2, 6], ["mat3", mat3, 9], ["mat3x4", mat3x4, 12],
      ["mat4x2", mat4x2, 8], ["mat4x3", mat4x3, 12], ["mat4", mat4, 16],
    ];
    for (let [name, ctor, count] of cases) {
      let values = Array.from({ length: count }, (_, i) => i);
      let prog = Fn(() => ctor(...values).toVar());
      expect(compileGLSL(prog()), name).toContain(name + "(");
      expect(compileWGSL(prog()), name).toContain("<f32>(");
    }
  });

  // GLSL reads a lone scalar as a diagonal, so WGSL — which has no such
  // overload — has to write every component out. The expansion has to know the
  // shape: a matCxR is C columns of R rows, and only the square types were
  // listed, so the non-square ones passed straight through as `mat2x3<f32>(2f)`.
  it("expands a scalar matrix constructor to a full diagonal in WGSL", () => {
    let cases: [string, any, string][] = [
      ["mat2", mat2, "mat2x2<f32>(2f, 0f, 0f, 2f)"],
      ["mat3", mat3, "mat3x3<f32>(2f, 0f, 0f, 0f, 2f, 0f, 0f, 0f, 2f)"],
      ["mat2x3", mat2x3, "mat2x3<f32>(2f, 0f, 0f, 0f, 2f, 0f)"],
      ["mat3x2", mat3x2, "mat3x2<f32>(2f, 0f, 0f, 2f, 0f, 0f)"],
      ["mat4x2", mat4x2, "mat4x2<f32>(2f, 0f, 0f, 2f, 0f, 0f, 0f, 0f)"],
    ];
    for (let [name, ctor, want] of cases) {
      let prog = Fn(() => ctor(2.0).toVar());
      expect(compileWGSL(prog()), name).toContain(want);
      // GLSL keeps the scalar form, which is what it means natively.
      expect(compileGLSL(prog()), name).toContain(name + "(2.0)");
    }
  });

  // A lone argument is only a diagonal when it is a scalar. Building a matrix
  // from another matrix is a copy/truncate, and expanding it produced
  // `mat3x3<f32>(m, 0f, 0f, 0f, m, ...)` — a constructor that does not exist.
  it("keeps a matrix-from-matrix constructor as a single argument", () => {
    let prog3 = Fn(() => mat3(uniform("mat3")).toVar());
    expect(compileWGSL(prog3())).toMatch(/mat3x3<f32>\(_rmsl_u\d+\)/);
    expect(compileGLSL(prog3())).toMatch(/mat3\(_rmsl_u\d+\)/);

    let prog4 = Fn(() => mat4(uniform("mat4")).toVar());
    expect(compileWGSL(prog4())).toMatch(/mat4x4<f32>\(_rmsl_u\d+\)/);
  });

  it("compiles every swizzle accessor", () => {
    let single = ["x", "y", "z", "w", "r", "g", "b", "a"];
    let pairs = ["xy", "xz", "xw", "yz", "yw", "zw"];
    let triples = ["xyz", "xyw", "xzw", "yzw", "rgb"];
    for (let s of [...single, ...pairs, ...triples, "rgba"]) {
      let prog = Fn(() => (uniform("vec4") as any)[s].toVar());
      expect(compileGLSL(prog()), s).toContain("." + s);
      expect(compileWGSL(prog()), s).toContain("." + s);
    }
  });

  // Raw JS arrays are accepted wherever a node is, and their length picks the
  // type. Only the vec3 length had ever been exercised.
  it("wraps raw arrays by length", () => {
    // Widths have to match the receiver — neither language multiplies a vec4 by
    // a vec3, and writing it that way is how the first draft of this test got
    // caught by the shader validation rather than by its own assertions.
    let cases: [() => any, string, string][] = [
      [() => vec2(1, 1).mult([1, 2] as any), "vec2", "vec2<f32>"],
      [() => vec3(1, 1, 1).mult([1, 2, 3] as any), "vec3", "vec3<f32>"],
      [() => vec4(1, 1, 1, 1).mult([1, 2, 3, 4] as any), "vec4", "vec4<f32>"],
    ];
    for (let [build, glslType, wgslType] of cases) {
      let prog = Fn(() => build().toVar());
      expect(compileGLSL(prog()), glslType).toContain(glslType + "(");
      expect(compileWGSL(prog()), wgslType).toContain(wgslType + "(");
    }
  });

  // === Shared nodes ===
  //
  // The graph is a DAG, not a tree: `Fn` returning an array gives every element
  // the whole block scope, so a node reachable from two roots is traversed
  // twice. Emitting it twice duplicates its side effects, and suppressing only
  // its declaration leaves the second copy referring to a name that no longer
  // exists. Each shared node has to be emitted exactly once.

  it("emits a shared If body once, not once per root", () => {
    let build = () => Fn(() => {
      let acc = float(0).toVar();
      If(boolean(true), () => { acc.assign(acc.add(10)); });
      return [acc, acc.mult(2)] as any;
    });
    let glsl = compileGLSL(build()() as any);
    expect(glsl.match(/if \(true\)/g) ?? []).toHaveLength(1);
    expect(glsl.match(/\+ 10\.0/g) ?? []).toHaveLength(1);

    let wgsl = compileWGSL(build()() as any);
    expect(wgsl.match(/if \(true\)/g) ?? []).toHaveLength(1);
    expect(wgsl.match(/\+ 10f/g) ?? []).toHaveLength(1);
  });

  // A toVar() inside a shared block declares its variable in that block. Emit
  // the block twice while declaring only once and the second copy reads a name
  // scoped to the first — `_rmsl_2` used outside the `if` that declared it.
  it("keeps a variable declared inside a shared block in scope", () => {
    let build = () => Fn(() => {
      let a = float(1).toVar();
      If(boolean(true), () => { let b = a.add(2).toVar(); a.assign(b); });
      return [a, a.mult(2)] as any;
    });
    let glsl = compileGLSL(build()() as any);
    expect(glsl.match(/if \(true\)/g) ?? []).toHaveLength(1);
    // The declaration and its only use are both inside the single block.
    let inner = glsl.slice(glsl.indexOf("if (true)"));
    let declared = inner.match(/float (_rmsl_\d+) = \(_rmsl_\d+ \+ 2\.0\);/);
    expect(declared, "inner declaration emitted").not.toBeNull();
    expect(inner.match(new RegExp(declared![1], "g")) ?? []).toHaveLength(2);

    expect(compileWGSL(build()() as any).match(/if \(true\)/g) ?? []).toHaveLength(1);
  });

  // The loop counter is declared by the for header. Emitting the loop twice
  // while suppressing the declaration produced `for (_rmsl_4; ...)`, whose
  // counter belongs to the first loop's scope.
  it("emits a shared For loop once, with its init intact", () => {
    let build = () => Fn(() => {
      let total = float(0).toVar();
      For(
        () => float(0).toVar(),
        (i) => i.lessThan(4),
        (i) => i.assign(i.add(1)),
        (i) => { total.assign(total.add(i)); },
      );
      return [total, total.mult(2)] as any;
    });
    let glsl = compileGLSL(build()() as any);
    expect(glsl.match(/for \(/g) ?? []).toHaveLength(1);
    expect(glsl).toMatch(/for \(float _rmsl_\d+ = 0\.0;/);

    let wgsl = compileWGSL(build()() as any);
    expect(wgsl.match(/for \(/g) ?? []).toHaveLength(1);
    expect(wgsl).toMatch(/for \(var _rmsl_\d+: f32 = 0f;/);
  });

  // Folding runs on literal operands; the integer branch truncates with `| 0`.
  it("folds integer arithmetic with truncation", () => {
    expect(compileGLSL(Fn(() => int(7).div(int(2)).toVar())())).toContain("= 3;");
    expect(compileGLSL(Fn(() => int(7).add(int(2)).toVar())())).toContain("= 9;");
    expect(compileGLSL(Fn(() => int(7).sub(int(2)).toVar())())).toContain("= 5;");
    expect(compileGLSL(Fn(() => int(7).mult(int(2)).toVar())())).toContain("= 14;");
    // The float path keeps the fraction the integer path drops.
    expect(compileGLSL(Fn(() => float(7).div(float(2)).toVar())())).toContain("3.5");
  });
});
