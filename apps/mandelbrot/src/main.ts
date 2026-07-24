import { compileGLSL } from "@random-mesh/rmsl";
import {
  vertexMain, calcMandelbrot, quadPos,
  u_resolution, u_maxIter, u_useHighPrecision,
  u_pan_hi, u_pan_lo, u_scale_hi, u_scale_lo, u_palette,
} from "./mandelbrotShader";

// === Compile RMSL shaders to GLSL ===
const vsGLSL = compileGLSL.vertex(vertexMain());
const fsGLSL = compileGLSL.fragment(calcMandelbrot());

// Helper to split a double (f64 number) into two single precision floats (f32)
function splitFloat(v: number): [number, number] {
  const hi = Math.fround(v);
  const lo = Math.fround(v - hi);
  return [hi, lo];
}

// === App state ===
let panX = -0.75;
let panY = 0.0;
let zoom = 3.2; // initial view span
let useHighPrecision = false;
let maxIter = 256;
let palette = 0;

// Quad geometry (-1..1)
const quadVerts = new Float32Array([
  -1, -1,
   1, -1,
  -1,  1,
   1,  1,
]);

// === WebGL2 setup ===
const canvas = document.getElementById("c") as HTMLCanvasElement;
const gl = canvas.getContext("webgl2");

if (!gl) {
  document.body.innerHTML = "<h1 style='color:white;padding:20px'>WebGL2 not supported</h1>";
  throw new Error("WebGL2 not supported");
}

function compileShader(src: string, type: number): WebGLShader {
  const s = gl!.createShader(type)!;
  gl!.shaderSource(s, src);
  gl!.compileShader(s);
  if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) {
    const err = gl!.getShaderInfoLog(s);
    console.error("Shader compile error:", err, "\nSource:\n", src);
    throw new Error("Shader compile error: " + err);
  }
  return s;
}

const vs = compileShader(vsGLSL, gl.VERTEX_SHADER);
const fs = compileShader(fsGLSL, gl.FRAGMENT_SHADER);

const program = gl.createProgram()!;
gl.attachShader(program, vs);
gl.attachShader(program, fs);
gl.linkProgram(program);

if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
  const err = gl.getProgramInfoLog(program);
  console.error("Program link error:", err);
  throw new Error("Program link error: " + err);
}

gl.useProgram(program);

// Set up full-screen quad VAO/VBO
const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
const vbo = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);

const attrLoc = gl.getAttribLocation(program, quadPos.name);
gl.enableVertexAttribArray(attrLoc);
gl.vertexAttribPointer(attrLoc, 2, gl.FLOAT, false, 0, 0);

// Get uniform locations
const locRes = gl.getUniformLocation(program, u_resolution.name);
const locMaxIter = gl.getUniformLocation(program, u_maxIter.name);
const locPrec = gl.getUniformLocation(program, u_useHighPrecision.name);
const locPanHi = gl.getUniformLocation(program, u_pan_hi.name);
const locPanLo = gl.getUniformLocation(program, u_pan_lo.name);
const locScaleHi = gl.getUniformLocation(program, u_scale_hi.name);
const locScaleLo = gl.getUniformLocation(program, u_scale_lo.name);
const locPalette = gl.getUniformLocation(program, u_palette.name);

// === UI elements ===
const precisionBtn = document.getElementById("precisionBtn") as HTMLButtonElement;
const iterInput = document.getElementById("iterInput") as HTMLInputElement;
const iterVal = document.getElementById("iterVal") as HTMLElement;
const paletteSelect = document.getElementById("paletteSelect") as HTMLSelectElement;
const resetBtn = document.getElementById("resetBtn") as HTMLButtonElement;
const hudZoom = document.getElementById("hudZoom") as HTMLElement;
const hudPan = document.getElementById("hudPan") as HTMLElement;

// === Dirty-flag render scheduling ===
let needsRender = false;
let rafId: number | null = null;

function requestRender() {
  needsRender = true;
  if (rafId === null) {
    rafId = requestAnimationFrame(render);
  }
}

function updateUI() {
  precisionBtn.classList.toggle("active", useHighPrecision);
  precisionBtn.innerHTML = useHighPrecision
    ? "High Precision: ON <span>(2x Float32)</span>"
    : "High Precision: OFF <span>(1x Float32)</span>";
  iterVal.textContent = maxIter.toString();

  const scale = zoom / Math.min(canvas.width, canvas.height);
  const zoomFactor = 1.0 / scale;
  hudZoom.textContent = zoomFactor > 1e4 ? zoomFactor.toExponential(2) + "x" : zoomFactor.toFixed(1) + "x";
  hudPan.textContent = `(${panX.toFixed(6)}, ${panY.toFixed(6)})`;

  requestRender();
}

precisionBtn.addEventListener("click", () => {
  useHighPrecision = !useHighPrecision;
  updateUI();
  requestRender();
});

iterInput.addEventListener("input", (e) => {
  maxIter = parseInt((e.target as HTMLInputElement).value, 10);
  updateUI();
});

paletteSelect.addEventListener("change", (e) => {
  palette = parseInt((e.target as HTMLSelectElement).value, 10);
  requestRender();
});

resetBtn.addEventListener("click", () => {
  panX = -0.75;
  panY = 0.0;
  zoom = 3.2;
  updateUI();
});

// === Pointer & Multi-touch Pinch-Zoom-Pan State ===
const activePointers = new Map<number, { clientX: number; clientY: number }>();
let isPanning = false;
let isPinching = false;
let panStart: { panX: number; panY: number; px: number; py: number } | null = null;
let lastPinchDist = 0;
let lastPinchCenterX = 0;
let lastPinchCenterY = 0;

canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

  try {
    canvas.setPointerCapture(e.pointerId);
  } catch (err) {
    console.warn("setPointerCapture failed:", err);
  }

  if (activePointers.size === 1) {
    isPanning = true;
    isPinching = false;
    panStart = { panX, panY, px: e.clientX, py: e.clientY };
  } else if (activePointers.size === 2) {
    isPanning = false;
    isPinching = true;
    panStart = null;
    const pointers = [...activePointers.values()];
    lastPinchDist = Math.hypot(
      pointers[0].clientX - pointers[1].clientX,
      pointers[0].clientY - pointers[1].clientY
    );

    const rect = canvas.getBoundingClientRect();
    const screenX = (pointers[0].clientX + pointers[1].clientX) / 2 - rect.left;
    const screenY = (pointers[0].clientY + pointers[1].clientY) / 2 - rect.top;

    lastPinchCenterX = screenX - canvas.width / 2;
    lastPinchCenterY = canvas.height / 2 - screenY;
  }
});

canvas.addEventListener("pointermove", (e) => {
  if (!activePointers.has(e.pointerId)) return;
  e.preventDefault();

  activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

  const minDim = Math.min(canvas.width, canvas.height);

  if (isPinching && activePointers.size === 2) {
    const pointers = [...activePointers.values()];
    const dist = Math.hypot(
      pointers[0].clientX - pointers[1].clientX,
      pointers[0].clientY - pointers[1].clientY
    );

    const rect = canvas.getBoundingClientRect();
    const screenX = (pointers[0].clientX + pointers[1].clientX) / 2 - rect.left;
    const screenY = (pointers[0].clientY + pointers[1].clientY) / 2 - rect.top;

    // Current pixel offset relative to canvas center
    const dxCurr = screenX - canvas.width / 2;
    const dyCurr = canvas.height / 2 - screenY; // WebGL +Y is UP

    if (lastPinchDist > 0 && dist > 0) {
      const oldScale = zoom / minDim;

      // Complex number that was under the fingers at the start of frame
      const mX = panX + lastPinchCenterX * oldScale;
      const mY = panY + lastPinchCenterY * oldScale;

      // Update zoom level
      zoom *= lastPinchDist / dist;
      const newScale = zoom / minDim;

      // Update pan so (mX, mY) follows the fingers to dxCurr, dyCurr
      panX = mX - dxCurr * newScale;
      panY = mY - dyCurr * newScale;

      updateUI();
    }

    lastPinchDist = dist;
    lastPinchCenterX = dxCurr;
    lastPinchCenterY = dyCurr;
    return;
  }

  if (isPanning && panStart) {
    const scale = zoom / minDim;
    const dx = e.clientX - panStart.px;
    const dy = e.clientY - panStart.py;

    panX = panStart.panX - dx * scale;
    panY = panStart.panY + dy * scale; // WebGL +Y is UP
    updateUI();
  }
});

function endPointer(pointerId: number) {
  activePointers.delete(pointerId);
  try {
    canvas.releasePointerCapture(pointerId);
  } catch {}

  if (activePointers.size < 2) {
    lastPinchDist = 0;
    isPinching = false;
  }
  if (activePointers.size === 1) {
    const p = [...activePointers.values()][0];
    isPanning = true;
    panStart = { panX, panY, px: p.clientX, py: p.clientY };
  } else if (activePointers.size === 0) {
    isPanning = false;
    panStart = null;
  }
}

canvas.addEventListener("pointerup", (e) => {
  endPointer(e.pointerId);
});

canvas.addEventListener("pointercancel", (e) => {
  endPointer(e.pointerId);
});

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const screenX = e.clientX - rect.left;
  const screenY = e.clientY - rect.top;

  const dx = screenX - canvas.width / 2;
  const dy = canvas.height / 2 - screenY;

  const minDim = Math.min(canvas.width, canvas.height);
  const oldScale = zoom / minDim;

  const mX = panX + dx * oldScale;
  const mY = panY + dy * oldScale;

  const factor = Math.pow(1.0015, e.deltaY);
  zoom *= factor;

  const newScale = zoom / minDim;
  panX = mX - dx * newScale;
  panY = mY - dy * newScale;

  updateUI();
}, { passive: false });

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  updateUI();
}

window.addEventListener("resize", resize);
resize();

// === Render (on-demand, driven by dirty flag) ===
function render() {
  rafId = null;
  if (!needsRender) return;
  needsRender = false;

  const w = canvas.width;
  const h = canvas.height;
  gl!.viewport(0, 0, w, h);
  gl!.clear(gl!.COLOR_BUFFER_BIT);

  const minDim = Math.min(w, h);
  const scale = zoom / minDim;

  const [panXHi, panXLo] = splitFloat(panX);
  const [panYHi, panYLo] = splitFloat(panY);
  const [scaleHi, scaleLo] = splitFloat(scale);

  gl!.uniform2f(locRes, w, h);
  gl!.uniform1i(locMaxIter, maxIter);
  gl!.uniform1i(locPrec, useHighPrecision ? 1 : 0);
  gl!.uniform2f(locPanHi, panXHi, panYHi);
  gl!.uniform2f(locPanLo, panXLo, panYLo);
  gl!.uniform2f(locScaleHi, scaleHi, scaleHi);
  gl!.uniform2f(locScaleLo, scaleLo, scaleLo);
  gl!.uniform1i(locPalette, palette);

  gl!.bindVertexArray(vao);
  gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
}

// Initial render
requestRender();
