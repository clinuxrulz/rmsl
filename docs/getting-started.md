# Getting Started

RMSL (Random Mesh Shading Language) is a TypeScript DSL for building shader programs. You construct a node graph in TypeScript and compile it to GLSL (WebGL 2) or WGSL (WebGPU) source code.

## Installation

```bash
pnpm add rmsl
```

## Hello World

```typescript
import { Fn, float, compileGLSL } from "rmsl";

let prog = Fn(() => {
  let x = float(1.5).toVar();
  let y = float(2.0).toVar();
  return x.add(y).toVar();
});

let glsl = compileGLSL(prog());
console.log(glsl);
```

Output:

```glsl
#version 300 es
precision highp float;

void main(void) {
  float _rmsl_0 = 1.5;
  float _rmsl_1 = 2.0;
  float _rmsl_2 = (_rmsl_0 + _rmsl_1);
}
```

## How It Works

1. **`Fn(() => { ... })`** captures a scope. Inside it, you build a tree of `Node<T>` objects.
2. **`.toVar()`** assigns an expression to a temporary variable and returns a reference to it.
3. **`compileGLSL(root)`** / **`compileWGSL(root)`** walks the node tree and emits shader source.

## Compiling to WebGPU (WGSL)

```typescript
import { compileWGSL } from "rmsl";

let wgsl = compileWGSL(prog());
```

## Next

See [API Reference](api.md) for the full type system and operations.
