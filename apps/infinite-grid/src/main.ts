import {
  compileGLSL, compileWGSL, float, Fn, If, uniform, varying, output,
  attribute, boolean, Node, vec2, vec3, vec4, builtinFragDepth,
} from "rmsl";

// === Shared RMSL declarations (used in both vertex & fragment) ===
let quadPos = attribute("vec2");
let positionWorld = varying("vec3");
let positionGeometry = varying("vec3");
let cameraProjectionMatrix = uniform("mat4");
let cameraViewMatrix = uniform("mat4");
let cameraProjectionMatrixInverse = uniform("mat4");
let cameraWorldMatrix = uniform("mat4");
let cameraPosition = uniform("vec3");

// === Vertex shader — full-screen quad ===
let vertexMain = Fn(() => {
  positionGeometry.assign(vec3(quadPos.x, quadPos.y, 0.0));
  positionWorld.assign(vec3(quadPos.x, 0.0, quadPos.y));
  return vec4(quadPos.x, quadPos.y, 0.0, 1.0);
});

// === Fragment shader — infinite grid ===
let getGrid = Fn((size: Node<"float">, p: Node<"vec3">) => {
  let r = p.xz.div(size).toVar();
  let grid = r.sub(0.5).fract().sub(0.5).abs().div(r.fwidth());
  let line = grid.x.min(grid.y);
  return float(1.0).sub(line.mult(0.5).min(1.0));
});

let calcColourAndDepth = Fn(() => {
  let isOrthographic = boolean(false).toVar();

  let skyColour = vec3(0.3, 0.4, 0.6);
  let horizSkyColour = vec3(0.5, 0.5, 0.6);

  let ro = vec3().toVar();
  let rd = vec3().toVar();

  If(isOrthographic, () => {
    rd.assign(vec3(
      cameraViewMatrix.element(0).z,
      cameraViewMatrix.element(1).z,
      cameraViewMatrix.element(2).z,
    ).negate().normalize());
    ro.assign(positionWorld);
  }).Else(() => {
    ro.assign(cameraPosition);
    let viewPos = cameraProjectionMatrixInverse.mult(vec4(positionGeometry.x, positionGeometry.y, -1.0, 1.0));
    let worldDir = cameraWorldMatrix.mult(vec4(viewPos.x, viewPos.y, viewPos.z, 0.0));
    rd.assign(worldDir.xyz.normalize());
  });

  let colour = vec3(0.7, 0.7, 0.7).toVar();
  let outColor = output("vec4");
  let fragDepth = builtinFragDepth();

  let groundColour = vec3(0.7, 0.7, 0.7).toVar();
  let gridColour = vec3(0.5, 0.5, 0.5).toVar();
  If(isOrthographic, () => {
    groundColour.assign(vec3(0.9, 0.9, 0.9));
    gridColour.assign(vec3(0.8, 0.8, 0.8));
  });

  let isPerspective = isOrthographic.not();

  If(isPerspective.and(ro.y.lessThan(0.0)), () => {
    colour.assign(skyColour);
  }).ElseIf(isPerspective.and(rd.y.greaterThan(0.3)), () => {
    colour.assign(skyColour);
  }).ElseIf(isPerspective.and(rd.y.greaterThan(0.0)), () => {
    let t = rd.y.div(0.03).clamp(0, 1);
    colour.assign(horizSkyColour.mix(skyColour, t));
  }).Else(() => {
    let fadeFactor = float(1.0).toVar();
    If(isOrthographic, () => {
      fadeFactor.assign(rd.y.abs());
    }).Else(() => {
      fadeFactor.assign(float(1.0).sub(ro.y.div(float(8000.0))).clamp(0.0, 1.0));
      fadeFactor.assign(fadeFactor.pow(3.0));
    });
    If(rd.y.abs().lessThan(0.0001), () => {
      colour.assign(groundColour);
    }).Else(() => {
      let p = ro.add(rd.mult(ro.y.negate().div(rd.y))).toVar();
      let refDist = float(1.0).toVar();
      If(isOrthographic, () => {
        refDist.assign(float(1.0).div(cameraProjectionMatrix.element(0).x.abs().max(float(0.001))));
      }).Else(() => {
        refDist.assign(cameraPosition.y.abs().mult(0.1).max(float(0.001)));
      });
      let exponent = refDist.log().div(float(Math.log(10))).floor().clamp(-3, 6);
      let minorSize = float(10.0).pow(exponent);
      let g1 = getGrid(minorSize, p).toVar();
      let g2 = getGrid(minorSize.mult(10.0), p).toVar();
      let fc = vec4(1.0, 1.0, 1.0, g2.mix(g1, g1).mult(fadeFactor)).toVar();
      let fca = fc.a.mult(0.5).mix(fc.a, g2);
      If(fca.lessThanEqual(0.0), () => {
        colour.assign(groundColour);
      }).Else(() => {
        colour.assign(groundColour.mix(gridColour, fca));
      });
    });
  });

  If(rd.y.lessThan(-0.001), () => {
    let t = ro.y.negate().div(rd.y);
    let p = ro.add(rd.mult(t));
    let clipPos = cameraProjectionMatrix.mult(cameraViewMatrix).mult(vec4(p.x, p.y, p.z, 1.0)).toVar();
    let ndcZ = clipPos.z.div(clipPos.w);
    fragDepth.assign(ndcZ.mult(0.5).add(0.5));
  });

  outColor.assign(vec4(colour, 1.0));
  return outColor;
});

// === Compile shaders ===
let vsGLSL = compileGLSL.vertex(vertexMain());
let fsGLSL = compileGLSL.fragment(calcColourAndDepth());

// === Matrix math utilities (column-major Float32Array) ===
function mat4Perspective(fovY: number, aspect: number, near: number, far: number): Float32Array {
  let f = 1 / Math.tan(fovY / 2);
  let nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function mat4LookAt(eyeX: number, eyeY: number, eyeZ: number, cx: number, cy: number, cz: number, upX: number, upY: number, upZ: number): Float32Array {
  let zx = eyeX - cx, zy = eyeY - cy, zz = eyeZ - cz;
  let zl = Math.sqrt(zx * zx + zy * zy + zz * zz);
  zx /= zl; zy /= zl; zz /= zl;
  let xx = upY * zz - upZ * zy;
  let xy = upZ * zx - upX * zz;
  let xz = upX * zy - upY * zx;
  let xl = Math.sqrt(xx * xx + xy * xy + xz * xz);
  xx /= xl; xy /= xl; xz /= xl;
  let yx = zy * xz - zz * xy;
  let yy = zz * xx - zx * xz;
  let yz = zx * xy - zy * xx;
  return new Float32Array([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * eyeX + xy * eyeY + xz * eyeZ),
    -(yx * eyeX + yy * eyeY + yz * eyeZ),
    -(zx * eyeX + zy * eyeY + zz * eyeZ),
    1,
  ]);
}

function mat4Multiply(a: Float32Array, b: Float32Array): Float32Array {
  let out = new Float32Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + i] * b[j * 4 + k];
      out[j * 4 + i] = s;
    }
  }
  return out;
}

function mat4Inverse(m: Float32Array): Float32Array {
  let a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
  let a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  let a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
  let a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
  let b00 = a00 * a11 - a01 * a10;
  let b01 = a00 * a12 - a02 * a10;
  let b02 = a00 * a13 - a03 * a10;
  let b03 = a01 * a12 - a02 * a11;
  let b04 = a01 * a13 - a03 * a11;
  let b05 = a02 * a13 - a03 * a12;
  let b06 = a20 * a31 - a21 * a30;
  let b07 = a20 * a32 - a22 * a30;
  let b08 = a20 * a33 - a23 * a30;
  let b09 = a21 * a32 - a22 * a31;
  let b10 = a21 * a33 - a23 * a31;
  let b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return new Float32Array(16);
  let id = 1 / det;
  let out = new Float32Array(16);
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * id;
  out[1] = (-a01 * b11 + a02 * b10 - a03 * b09) * id;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * id;
  out[3] = (-a21 * b05 + a22 * b04 - a23 * b03) * id;
  out[4] = (-a10 * b11 + a12 * b08 - a13 * b07) * id;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * id;
  out[6] = (-a30 * b05 + a32 * b02 - a33 * b01) * id;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * id;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * id;
  out[9] = (-a00 * b10 + a01 * b08 - a03 * b06) * id;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * id;
  out[11] = (-a20 * b04 + a21 * b02 - a23 * b00) * id;
  out[12] = (-a10 * b09 + a11 * b07 - a12 * b06) * id;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * id;
  out[14] = (-a30 * b03 + a31 * b01 - a32 * b00) * id;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * id;
  return out;
}

// === Orbital camera state ===
let theta = 0;
let phi = 0.6;
let radius = 10;
let isDragging = false;
let lastMX = 0;
let lastMY = 0;

function getViewMatrix(): Float32Array {
  let eyeX = radius * Math.sin(theta) * Math.cos(phi);
  let eyeY = radius * Math.sin(phi);
  let eyeZ = radius * Math.cos(theta) * Math.cos(phi);
  return mat4LookAt(eyeX, eyeY, eyeZ, 0, 0, 0, 0, 1, 0);
}

function getCameraPosition(): [number, number, number] {
  return [
    radius * Math.sin(theta) * Math.cos(phi),
    radius * Math.sin(phi),
    radius * Math.cos(theta) * Math.cos(phi),
  ];
}

// === WebGL2 setup ===
let canvas = document.createElement("canvas");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
document.body.appendChild(canvas);

let gl = canvas.getContext("webgl2")!;
if (!gl) {
  document.body.innerHTML = "<h1>WebGL2 not supported</h1>";
  throw new Error("WebGL2 not supported");
}

function compileShader(src: string, type: number): WebGLShader {
  let s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(s));
    throw new Error("Shader compile error");
  }
  return s;
}

let vs = compileShader(vsGLSL, gl.VERTEX_SHADER);
let fs = compileShader(fsGLSL, gl.FRAGMENT_SHADER);
let program = gl.createProgram()!;
gl.attachShader(program, vs);
gl.attachShader(program, fs);
gl.linkProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
  console.error(gl.getProgramInfoLog(program));
  throw new Error("Program link error");
}
gl.useProgram(program);

// Full-screen quad VBO
let quadVerts = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
let vao = gl.createVertexArray();
gl.bindVertexArray(vao);
let vbo = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
let attrLoc = gl.getAttribLocation(program, "_rmsl_a0");
gl.enableVertexAttribArray(attrLoc);
gl.vertexAttribPointer(attrLoc, 2, gl.FLOAT, false, 0, 0);

// Uniform locations
let uniforms = {
  projection: gl.getUniformLocation(program, "_rmsl_u0"),
  view: gl.getUniformLocation(program, "_rmsl_u1"),
  projInv: gl.getUniformLocation(program, "_rmsl_u2"),
  world: gl.getUniformLocation(program, "_rmsl_u3"),
  camPos: gl.getUniformLocation(program, "_rmsl_u4"),
};

// === Pointer / wheel events ===
canvas.addEventListener("pointerdown", (e) => {
  isDragging = true;
  lastMX = e.clientX;
  lastMY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!isDragging) return;
  let dx = e.clientX - lastMX;
  let dy = e.clientY - lastMY;
  theta -= dx * 0.005;
  phi = Math.max(-1.5, Math.min(1.5, phi - dy * 0.005));
  lastMX = e.clientX;
  lastMY = e.clientY;
});
canvas.addEventListener("pointerup", (e) => {
  isDragging = false;
  canvas.releasePointerCapture(e.pointerId);
});
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  radius *= 1 + e.deltaY * 0.001;
  radius = Math.max(0.5, Math.min(500, radius));
});

// === Resize ===
window.addEventListener("resize", () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});

// === Render loop ===
function render() {
  let w = canvas.width;
  let h = canvas.height;
  gl.viewport(0, 0, w, h);
  gl.clear(gl.DEPTH_BUFFER_BIT);

  let aspect = w / h;
  let near = 0.1;
  let far = 1000;
  let fov = 0.6;
  let proj = mat4Perspective(fov, aspect, near, far);
  let view = getViewMatrix();
  let projInv = mat4Inverse(proj);
  let world = mat4Inverse(view);
  let camPos = getCameraPosition();

  gl.uniformMatrix4fv(uniforms.projection, false, proj);
  gl.uniformMatrix4fv(uniforms.view, false, view);
  gl.uniformMatrix4fv(uniforms.projInv, false, projInv);
  gl.uniformMatrix4fv(uniforms.world, false, world);
  gl.uniform3f(uniforms.camPos, camPos[0], camPos[1], camPos[2]);

  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  requestAnimationFrame(render);
}

render();
