# Testing shaders on the CPU

`@random-mesh/rmsl/test` runs a shader graph as plain JavaScript, so its logic
can be asserted on in an ordinary unit test — no browser, no canvas, no
graphics device, no pixel readback.

```typescript
import { evaluate, render, approx } from "@random-mesh/rmsl/test";
import { uniform, vec3, vec4, mix, fragCoord } from "@random-mesh/rmsl";

const tint = uniform("vec3");
const ramp = vec4(mix(vec3(0, 0, 0), tint, fragCoord().x.div(8)), 1);

it("darkens towards the left edge", () => {
  const image = render(() => ramp, {
    width: 8,
    height: 1,
    uniforms: [[tint, [1, 1, 1]]],
  });
  for (let x = 1; x < image.width; x++) {
    expect(image.at(x, 0)[0]).toBeGreaterThan(image.at(x - 1, 0)[0]);
  }
});
```

It is built on the [JS / CPU target](compilation.md#js--cpu-target) and adds the
parts a test wants: inputs given as the nodes themselves instead of generated
slot names, a whole grid of fragments in one call, and comparisons that tolerate
the last bit of a float.

**What runs is the shader function.** There is no rasterizer — no triangles, no
interpolation, no depth test. A varying is a value you pass in, which is exactly
what makes a single fragment addressable.

## evaluate — one fragment

```typescript
const result = evaluate(() => graph, {
  uniforms: [[tint, [1, 0, 0]], [strength, 0.5]],
  varyings: [[surfaceNormal, [0, 1, 0]]],
  attributes: [[position, [0, 0, 0]]],
  textures: [[map, { data, width: 2, height: 2 }]],
  fragCoord: [8.5, 0.5],
});
```

The graph is given as a thunk, so a function taking arguments is tested by
calling it — `evaluate(() => myFn(float(2), vec2(1, 0)))`.

Each binding is `[node, value]`. The node knows which slot it is and what it
holds, so `[tint, 1]` on a `vec3` is a compile error rather than a `NaN` halfway
through a render.

| Shader type | Value |
|---|---|
| `float`, `int`, `uint` | `number` |
| `bool` | `boolean` |
| `bvec2`–`bvec4` | `boolean[]` |
| `vec2`–`vec4`, `ivecN`, `uvecN`, `matCxR` | `number[]` (matrices column-major) |
| `sampler2D`/`sampler3D` and integer variants | `{ data, width, height, depth? }` under `textures` |

Texture data may also arrive as `{ image, width, height }`, which is the shape a
scene `DataTexture` already has.

The result is one object however the graph is written:

```typescript
{
  value,      // what the graph returns, or null for a discarded fragment
  discarded,  // whether the fragment hit Discard()
  outputs,    // written with output(), by slot
  varyings,   // written with varying() in a vertex stage, by slot
  position,   // written with builtinPosition()
  fragDepth,  // written with builtinFragDepth()
}
```

A vertex stage is `{ stage: "vertex" }`.

## render — a grid of fragments

```typescript
const image = render(() => graph, {
  width: 64,
  height: 64,
  uniforms: [[tint, [1, 0, 0]]],
  inputs: ({ u, v }) => ({ varyings: [[surfaceUv, [u, v]]] }),
});
```

Every fragment in the rectangle is evaluated, its `fragCoord` at the pixel
centre. `inputs` supplies what differs per fragment; `x`/`y` are the integer
coordinates and `u`/`v` the same point in `0..1`.

```typescript
image.at(32, 32);          // [r, g, b, a] at one fragment
image.isDiscarded(0, 0);   // whether it discarded
image.resultAt(0, 0);      // the full result, for outputs or fragDepth
image.pixels;              // Float32Array, four channels per fragment
image.toUint8();           // clamped 8-bit RGBA, for an image file or a snapshot
image.toAscii();           // the picture as text
```

A scalar shader lights all three colour channels, the way a greyscale value
reads; a shorter vector leaves the rest at zero with an opaque alpha. A
discarded fragment is four zeroes.

`toAscii()` is the one worth knowing about — a shader snapshot that reads in a
terminal diff:

```typescript
const disc = float(1).sub(smoothstep(float(0.7), float(1), length(centred)));
render(() => vec4(vec3(disc), 1), { width: 24, height: 12 }).toAscii();
```

```
         ..::..         
     .-+*#%%%%#*+-.     
   :=#@@@@@@@@@@@@#=:   
  -*%@@@@@@@@@@@@@@%*-  
 :+%@@@@@@@@@@@@@@@@%+: 
 -#@@@@@@@@@@@@@@@@@@#- 
 -#@@@@@@@@@@@@@@@@@@#- 
 :+%@@@@@@@@@@@@@@@@%+: 
  -*%@@@@@@@@@@@@@@%*-  
   :=#@@@@@@@@@@@@#=:   
     .-+*#%%%%#*+-.     
         ..::..         
```

Handed to `toMatchInlineSnapshot`, that is a shader regression test whose diff
is readable: a shifted edge shows up as a shifted edge.

Rows run bottom-up, as `fragCoord` counts: `pixels` starts at `y = 0`, and
`toAscii` prints the top row of the image first. Both `toAscii` and `toUint8`
take `{ flipY: true }` for the top-down order image formats want.

## runner — compile once, evaluate many times

`evaluate` and `render` compile on every call, which is what you want for a
single assertion. When the same graph is measured across many inputs — a sweep
over a uniform, a search for where a distance field crosses zero — compile it
once:

```typescript
const run = runner(() => graph, { uniforms: [[tint, [1, 1, 1]]] });  // defaults
const near = run({ uniforms: [[distance, 0.1]] });                   // overrides
run.source;  // the generated JavaScript, for when a result needs explaining
```

A runner is accepted anywhere a graph is, including by `render`.

## Materials and effect passes

A built material is a node graph like any other, so it runs here too — which
means a lighting model, a colour node or a texture lookup is testable without a
renderer, a canvas or a light rig.

```typescript
import { fromProgram } from "@random-mesh/rmsl/test";

const shade = fromProgram(material.build(scene, {}));

shade({ varyings: { normalWorld: [0, 1, 0], positionWorld: [0, 0, 0] } });
```

Everything is addressed by the name the program uses — `uv`, `normalWorld`,
`materialColor` — not by node. Material-scope uniforms fill themselves in from
the program (the colour, the roughness, the light set), and a `DataTexture` a
material already points at is sampled as it stands. The matrices a renderer
would compute default to the identity, so a material that only shades a surface
needs nothing further:

```typescript
fromProgram(program, {
  uniforms: { cameraPosition: [0, 0, 5], materialColor: [1, 0, 0] },  // by name
  resolution: [1920, 1080],   // what a renderer-scope `resolution` uniform holds
  context: { camera, mesh },  // for a material whose uniform values read them
});
```

`shade.unbound` lists the uniforms nothing filled in — the first place to look
when a result comes back `NaN`.

A runner from a program is a runner like any other, so `render` drives it:

```typescript
const image = render(shade, {
  width: 64,
  height: 64,
  inputs: ({ u, v }) => ({ varyings: { uv: [u, v] } }),
});
```

One pass of an effect works the same way, its input textures named as the pass
names them:

```typescript
import { fromPass } from "@random-mesh/rmsl/test";

const run = fromPass(pass, {
  textures: { source: { data: pixels, width: 4, height: 4 } },
});
```

A pass that reads `uv()` also holds a screen-size uniform it never named; reach
it with `uniformsIn(pass.color, "vec2")`.

The program is taken by shape, not by import, so nothing here drags the scene
graph or the effects into a test that only wanted a shader.

## Comparing values

Shader arithmetic is not reproduced exactly by the arithmetic a test writes out
by hand, so comparisons allow a gap that scales with the size of the numbers
involved (`tolerance(x)`, roughly one part in a million, with a floor near zero).

```typescript
closeTo(result.value, [1, 0, 0, 1]);                  // boolean
closeTo(result.value, [1, 0, 0, 1], { tolerance: 0.01 });
expect(result.value).toSatisfy(approx([1, 0, 0, 1])); // a predicate for a matcher
assertClose(result.value, [1, 0, 0, 1], { message: "tint" });
```

`assertClose` throws with the component that differs named — `component 2:
expected 1, got 0` — and needs no test runner, so it works under vitest, jest or
`node:test` alike.

## Uniforms the graph made for itself

Most uniforms are held by the test that made them. Some are not: `uv()` mints a
screen-size uniform *inside* the graph, and a caller who never saw that node has
no other way to reach it.

```typescript
const [resolution] = uniformsIn(graph, "vec2");
render(() => graph, { width: 8, height: 8, uniforms: [[resolution, [8, 8]]] });
```

`uniformsIn(graph)` without a type lists every uniform the graph reads, in the
order it reaches them — useful when a result comes back `NaN` and the question
is what went unbound.

## What the CPU cannot tell you

- **Derivatives are zero.** `fwidth`/`dFdx`/`dFdy` measure the difference
  between neighbouring pixels, which a single evaluation has no notion of, so
  they read as zero here and an anti-aliased edge reads as a hard one. Pass
  `{ derivatives: "throw" }` to be told rather than quietly given zero.
- **Sampling is nearest-neighbour**, and `textureLod`'s level is ignored. A
  bilinear filter is a property of the sampler hardware, not of the graph. The
  0–255 an 8-bit texture holds does read back as the 0–1 a float sampler gives
  a shader, so a textured material measures here as it looks on screen.
- **The CPU computes f64, a GPU f32.** Results can differ in the last bits,
  which is what the tolerance is for. A test that must pin f32 behaviour still
  belongs on a device.
- **Nothing about the pipeline is exercised**: no blending, no depth test, no
  vertex-to-fragment interpolation, no bindings, no driver. This tests the
  arithmetic you wrote, not the way a renderer wires it up.
