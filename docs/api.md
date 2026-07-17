# API Reference

## Type Constructors

### Scalars

| Function | Signature | Description |
|----------|-----------|-------------|
| `float` | `(v: number \| Node<"int">) => Node<"float">` | Float literal or cast from int |
| `int` | `(v: number \| Node<"float">) => Node<"int">` | Int literal or cast from float |
| `boolean` | `(v: boolean) => Node<"bool">` | Bool literal |

### Vectors

| Function | Signature | Description |
|----------|-----------|-------------|
| `vec2` | `(x, y?) => Node<"vec2">` | From 2 scalars, 1 scalar, or another vector |
| `vec3` | `(x, y?, z?) => Node<"vec3">` | From 3 scalars, 1 scalar, or another vector |
| `vec4` | `(x, y?, z?, w?) => Node<"vec4">` | From 4 scalars, 1 scalar, or another vector |

`vec3(1.0)` creates a vector with all components set to `1.0`.
`vec3(vec4(1,2,3,4))` truncates to 3 components.

### Matrices

| Function | Components | Default (identity) |
|----------|-----------|-------------------|
| `mat2` | 2x2 | `[1,0,0,1]` |
| `mat2x3` | 2x3 | `[1,0,0,0,1,0]` |
| `mat2x4` | 2x4 | `[1,0,0,0,0,1,0,0]` |
| `mat3x2` | 3x2 | `[1,0,0,0,1,0]` |
| `mat3` | 3x3 | `[1,0,0,0,1,0,0,0,1]` |
| `mat3x4` | 3x4 | `[1,0,0,0,0,1,0,0,0,0,1,0]` |
| `mat4x2` | 4x2 | `[1,0,0,0,0,1,0,0]` |
| `mat4x3` | 4x3 | `[1,0,0,0,0,1,0,0,0,0,1,0]` |
| `mat4` | 4x4 | `[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]` |

`mat4(1.0)` fills the diagonal with `1.0` (scalar constructor).
`mat4(v4, v4, v4, v4)` constructs from column vectors.

## Operations

### ArithOps (float, vec2, vec3, vec4)

| Method | Returns | Description |
|--------|---------|-------------|
| `.add(other)` | Self | Addition |
| `.sub(other)` | Self | Subtraction |
| `.mult(other)` | Self | Multiplication |
| `.div(other)` | Self | Division |
| `.negate()` | Self | Negation |

### FloatMathOps (float, vec2, vec3, vec4)

**Trig:** `.sin()`, `.cos()`, `.tan()`, `.asin()`, `.acos()`, `.atan()`

**Utility:** `.abs()`, `.sign()`, `.floor()`, `.ceil()`, `.fract()`

**Exponential:** `.sqrt()`, `.inversesqrt()`, `.exp()`, `.log()`, `.exp2()`, `.log2()`

**Binary:** `.pow(e)`, `.min(other)`, `.max(other)`, `.mod(other)`

**Comparisons** (return `Node<"bool">`):
`.lessThan(other)`, `.greaterThan(other)`, `.lessThanEqual(other)`, `.greaterThanEqual(other)`, `.equal(other)`, `.notEqual(other)`

For scalar types these emit `a < b`; for vectors they emit `lessThan(a, b)` etc.

### VecCommonOps (vec2, vec3, vec4)

| Method | Returns | Description |
|--------|---------|-------------|
| `.dot(other)` | `float` | Dot product |
| `.length()` | `float` | Vector length |
| `.normalize()` | Self | Unit vector |
| `.distance(other)` | `float` | Distance between vectors |
| `.reflect(normal)` | Self | Reflection vector |
| `.refract(normal, eta)` | Self | Refraction vector |
| `.clamp(min, max)` | Self | Component-wise clamp |
| `.mix(b, t)` | Self | Linear interpolation |
| `.step(edge)` | `float` | Step function |
| `.smoothstep(edge0, edge1)` | Self | Smoothstep |

### Vec3Ops (vec3)

| Method | Returns | Description |
|--------|---------|-------------|
| `.cross(other)` | `vec3` | Cross product |

### MatOps (mat3, mat4)

| Method | Returns | Description |
|--------|---------|-------------|
| `.mult(other)` | Self | Matrix multiplication |
| `.multVec(vec3)` | `vec3` | Matrix x vec3 (promotes to vec4 with w=1) |
| `.multVec4(vec4)` | `vec4` | Matrix x vec4 |
| `.inverse()` | Self | Matrix inverse |
| `.transpose()` | Self | Matrix transpose |

### IntOps

Arithmetic: `.add()`, `.sub()`, `.mult()`, `.div()`, `.mod()`

Bitwise: `.bitAnd()`, `.bitOr()`, `.bitXor()`, `.shiftLeft()`, `.shiftRight()`

Comparisons: `.lessThan()`, `.greaterThan()`, `.lessThanEqual()`, `.greaterThanEqual()`, `.equal()`, `.notEqual()`

All return `Node<"int">` (arithmetic/bitwise) or `Node<"bool">` (comparisons).

### UintOps

Same as IntOps but with `Node<"uint">` inputs/outputs.

### SamplerOps (sampler2D)

| Method | Returns | Description |
|--------|---------|-------------|
| `.texture(coords)` | `vec4` | Sample texture at coordinates |
| `.textureLod(coords, lod)` | `vec4` | Sample with explicit LOD |

### BoolOps

| Method | Returns | Description |
|--------|---------|-------------|
| `.and(other)` | `bool` | Logical AND |
| `.or(other)` | `bool` | Logical OR |
| `.not()` | `bool` | Logical NOT |

## Swizzles

**vec3:** `.x`, `.y`, `.z`, `.r`, `.g`, `.b`, `.xy`, `.xz`, `.yz`, `.xyz`, `.rgb`

**vec4:** `.x`, `.y`, `.z`, `.w`, `.r`, `.g`, `.b`, `.a`, `.xy`, `.xz`, `.xw`, `.yz`, `.yw`, `.zw`, `.xyz`, `.xyw`, `.xzw`, `.yzw`, `.rgb`, `.rgba`

Swizzles are read-only. Use `.assign()` for swizzle writes:

```typescript
a.xy.assign(b.xy);  // compiles to a.xy = b.xy;
```

## Node Methods

| Method | Description |
|--------|-------------|
| `.toVar()` | Assigns expression to a temp variable, returns the variable reference |
| `.assign(value)` | Assigns a value to an existing variable or swizzle |

These only work inside an `Fn` scope.

## Control Flow

### If

```typescript
If(cond, () => {
  // then branch
}).ElseIf(otherCond, () => {
  // else-if branch
}).Else(() => {
  // else branch
});
```

### For

```typescript
For(
  () => int(0).toVar(),                // init - returns loop variable
  (i) => i.lessThan(int(10)),          // condition - receives variable
  (i) => { i.assign(i.add(int(1))); }, // update - receives variable
  (i) => {                              // body - receives variable
    // loop body
  },
);
```

### While

```typescript
While(condition, () => {
  // loop body
});
```

### Other

- **`discard()`** - fragment discard (like GLSL `discard`)
- **`break_()`** - break from loop (`break` is a JS reserved word)
- **`continue_()`** - continue to next iteration (`continue` is a JS reserved word)

## I/O

| Function | Returns | Description |
|----------|---------|-------------|
| `uniform(type)` | `Node<T>` | Declares a uniform (constant buffer input). The returned node has a `.name` property containing the generated name (e.g., `_rmsl_u0`). |
| `attribute(type)` | `Node<T>` | Declares a vertex attribute. The returned node has a `.name` property containing the generated name (e.g., `_rmsl_a0`). |
| `varying(type)` | `Node<T>` | Declares a varying (vertex→fragment interpolant). The returned node has a `.name` property containing the generated name (e.g., `_rmsl_v0`). |
| `output(type)` | `Node<T>` | Declares a fragment output with `@location(N)` |
| `builtinPosition()` | `Node<"vec4">` | Maps to `gl_Position` / `@builtin(position)` |
