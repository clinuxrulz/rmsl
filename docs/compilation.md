# Compilation

RMSL compiles node graphs to **GLSL** (WebGL 2 / OpenGL ES 3.0) or **WGSL** (WebGPU).

## Compiler API

```typescript
import { compileGLSL, compileWGSL } from "rmsl";
```

### Fragment shader (default)

```typescript
compileGLSL(root)           // fragment shader
compileGLSL.fragment(root)  // explicit fragment
compileWGSL(root)           // fragment shader
compileWGSL.fragment(root)  // explicit fragment
```

### Vertex shader

```typescript
compileGLSL.vertex(root)
compileWGSL.vertex(root)
```

### Multiple return values

```typescript
let prog = Fn(() => {
  let a = float(1).toVar();
  let b = float(2).toVar();
  return [a, b];
});
let [a, b] = prog();
compileGLSL.vertex([a, b]);  // pass array of roots
```

## GLSL Output

### Fragment shader

```glsl
#version 300 es
precision highp float;

// uniforms, attributes, varyings, outputs...

void main(void) {
  // shader body
}
```

### Vertex shader

Same structure, but the last expression is assigned to `gl_Position`:

```glsl
void main(void) {
  // body...
  gl_Position = <lastExpr>;
}
```

### Output variables

`output("vec4")` declares a `layout(location=N) out vec4 _rmsl_oN;` in the fragment shader.

### Varyings

`varying("vec3")` produces `out vec3 _rmsl_vN;` in vertex and `in vec3 _rmsl_vN;` in fragment.

## WGSL Output

### Fragment shader

```wgsl
struct FragmentOutput {
  @location(N) _rmsl_oN: type,
};

@fragment
fn main() -> FragmentOutput {
  // body...
  return FragmentOutput(...);
}
```

### Vertex shader

```wgsl
struct VertexInput {
  @location(N) _rmsl_aN: type,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  // varyings...
};

@vertex
fn main(input: VertexInput) -> VertexOutput {
  // body...
  return VertexOutput(...);
}
```

## Binding Model (WGSL)

| Resource | Group | Binding |
|----------|-------|---------|
| Uniforms | `@group(0)` | `@binding(N)` |
| Textures | `@group(1)` | `@binding(N)` |
| Samplers | `@group(2)` | `@binding(N)` |

## Type Mappings

### GLSL types

| RMSL | GLSL |
|------|------|
| `float`, `vec2`, `vec3`, `vec4` | same |
| `int`, `uint`, `bool` | same |
| `mat2`–`mat4`, `mat2x3`, etc. | same |
| `sampler2D` | `sampler2D` |

### WGSL types

| RMSL | WGSL |
|------|------|
| `float` | `f32` |
| `vec2` | `vec2<f32>` |
| `vec3` | `vec3<f32>` |
| `vec4` | `vec4<f32>` |
| `int` | `i32` |
| `uint` | `u32` |
| `bool` | `bool` |
| `mat2` | `mat2x2<f32>` |
| `mat3` | `mat3x3<f32>` |
| `mat4` | `mat4x4<f32>` |
| `mat2x3` | `mat2x3<f32>` |
| etc. | `<N>x<M><f32>` |
| `sampler2D` | `texture_2d<f32>` |

## Constant Folding

When all inputs to an operation are literal values, RMSL evaluates it at compile time:

```typescript
// These all fold to literal values:
let x = float(2.0).pow(float(3.0));   // -> 8
let y = int(5).add(int(3));           // -> 8
let z = float(0.5).sin();             // -> ~0.479
```

This applies to: `add`, `sub`, `mult`, `div`, `mod`, `negate`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `abs`, `sign`, `floor`, `ceil`, `fract`, `sqrt`, `inversesqrt`, `exp`, `log`, `exp2`, `log2`, `pow`, `min`, `max`.

## Type Coercion (WGSL)

When mixing `int`/`uint` with `float` in binary operations, the WGSL compiler inserts explicit `f32()` casts, since WGSL does not perform implicit numeric conversion.
