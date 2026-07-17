const __brand = Symbol();

// === Shader Types (strings, not TS enums) ===
export type ShaderType =
  | "float" | "vec2" | "vec3" | "vec4"
  | "int" | "uint" | "bool"
  | "mat2" | "mat2x3" | "mat2x4"
  | "mat3x2" | "mat3" | "mat3x4"
  | "mat4x2" | "mat4x3" | "mat4"
  | "sampler2D" | "samplerCube"
  | "void";

// === Like types (raw JS values | Node) ===
export type FloatLike = number | BaseNode<"float">;
export type Vec2Like = [number, number] | BaseNode<"vec2">;
export type Vec3Like = [number, number, number] | BaseNode<"vec3">;
export type Vec4Like = [number, number, number, number] | BaseNode<"vec4">;
export type IntLike = number | BaseNode<"int">;
export type UintLike = number | BaseNode<"uint">;
export type BooleanLike = boolean | BaseNode<"bool">;
export type Mat3Like = number[] | BaseNode<"mat3">;
export type Mat4Like = number[] | BaseNode<"mat4">;
export type Sampler2DLike = BaseNode<"sampler2D"> | Node<"sampler2D">;

// === BaseNode ===
export interface BaseNode<A extends ShaderType> {
  [__brand]: A;
  _t: string;
  type: string;
  params?: BaseNode<ShaderType>[];
  value?: unknown;
}

// === Per-type swizzle sets ===
type Vec3Swizzles = {
  readonly x: Node<"float">; readonly y: Node<"float">; readonly z: Node<"float">;
  readonly r: Node<"float">; readonly g: Node<"float">; readonly b: Node<"float">;
  readonly xy: Node<"vec2">; readonly xz: Node<"vec2">; readonly yz: Node<"vec2">;
  readonly xyz: Node<"vec3">; readonly rgb: Node<"vec3">;
};

type Vec4Swizzles = {
  readonly x: Node<"float">; readonly y: Node<"float">; readonly z: Node<"float">; readonly w: Node<"float">;
  readonly r: Node<"float">; readonly g: Node<"float">; readonly b: Node<"float">; readonly a: Node<"float">;
  readonly xy: Node<"vec2">; readonly xz: Node<"vec2">; readonly xw: Node<"vec2">;
  readonly yz: Node<"vec2">; readonly yw: Node<"vec2">; readonly zw: Node<"vec2">;
  readonly xyz: Node<"vec3">; readonly xyw: Node<"vec3">; readonly xzw: Node<"vec3">; readonly yzw: Node<"vec3">;
  readonly rgba: Node<"vec4">; readonly rgb: Node<"vec3">;
};

// === Node (branded + conditional methods + swizzles) ===
export type Node<A extends ShaderType> = BaseNode<A>
  & (A extends "float" ? ArithOps<"float"> & FloatMathOps<"float"> : {})
  & (A extends "vec2" ? ArithOps<"vec2"> & FloatMathOps<"vec2"> & VecCommonOps<"vec2"> : {})
  & (A extends "vec3" ? ArithOps<"vec3"> & FloatMathOps<"vec3"> & VecCommonOps<"vec3"> & Vec3Ops & Vec3Swizzles : {})
  & (A extends "vec4" ? ArithOps<"vec4"> & FloatMathOps<"vec4"> & VecCommonOps<"vec4"> & Vec4Swizzles : {})
  & (A extends "mat3" ? MatOps<"mat3"> : {})
  & (A extends "mat4" ? MatOps<"mat4"> : {})
  & (A extends "int" ? IntOps : {})
  & (A extends "uint" ? UintOps : {})
  & (A extends "bool" ? BoolOps : {})
  & (A extends "sampler2D" ? SamplerOps : {})
  & NodeMethods<A>;

// === Operation interfaces (shared across Node types) ===
interface ArithOps<A extends ShaderType> {
  add(other: FloatLike | Vec2Like | Vec3Like | Vec4Like): Node<A>;
  sub(other: FloatLike | Vec2Like | Vec3Like | Vec4Like): Node<A>;
  mult(other: FloatLike | Vec2Like | Vec3Like | Vec4Like): Node<A>;
  div(other: FloatLike | Vec2Like | Vec3Like | Vec4Like): Node<A>;
  negate(): Node<A>;
}

interface FloatMathOps<A extends ShaderType> {
  sin(): Node<A>; cos(): Node<A>; tan(): Node<A>;
  asin(): Node<A>; acos(): Node<A>; atan(): Node<A>;
  abs(): Node<A>; sign(): Node<A>;
  floor(): Node<A>; ceil(): Node<A>; fract(): Node<A>;
  sqrt(): Node<A>; inversesqrt(): Node<A>;
  exp(): Node<A>; log(): Node<A>; exp2(): Node<A>; log2(): Node<A>;
  pow(e: FloatLike): Node<A>;
  min(other: FloatLike): Node<A>;
  max(other: FloatLike): Node<A>;
  mod(other: FloatLike): Node<A>;
  lessThan(other: FloatLike | Vec2Like | Vec3Like | Vec4Like): Node<"bool">;
  greaterThan(other: FloatLike | Vec2Like | Vec3Like | Vec4Like): Node<"bool">;
  lessThanEqual(other: FloatLike | Vec2Like | Vec3Like | Vec4Like): Node<"bool">;
  greaterThanEqual(other: FloatLike | Vec2Like | Vec3Like | Vec4Like): Node<"bool">;
  equal(other: FloatLike | Vec2Like | Vec3Like | Vec4Like): Node<"bool">;
  notEqual(other: FloatLike | Vec2Like | Vec3Like | Vec4Like): Node<"bool">;
}

interface VecCommonOps<A extends "vec2" | "vec3" | "vec4"> {
  dot(other: Node<A>): Node<"float">;
  length(): Node<"float">;
  normalize(): Node<A>;
  distance(other: Node<A>): Node<"float">;
  reflect(normal: Node<A>): Node<A>;
  refract(normal: Node<A>, eta: FloatLike): Node<A>;
  clamp(min: Node<A>, max: Node<A>): Node<A>;
  mix(b: Node<A>, t: FloatLike): Node<A>;
  step(edge: Node<A>): Node<"float">;
  smoothstep(edge0: Node<A>, edge1: Node<A>): Node<A>;
}

interface Vec3Ops {
  cross(other: Node<"vec3">): Node<"vec3">;
}

interface MatOps<A extends "mat3" | "mat4"> {
  mult(other: Node<A>): Node<A>;
  multVec(other: Node<"vec3">): Node<"vec3">;
  multVec4(other: Node<"vec4">): Node<"vec4">;
  inverse(): Node<A>;
  transpose(): Node<A>;
}

interface IntOps {
  add(other: IntLike): Node<"int">;
  sub(other: IntLike): Node<"int">;
  mult(other: IntLike): Node<"int">;
  div(other: IntLike): Node<"int">;
  mod(other: IntLike): Node<"int">;
  bitAnd(other: IntLike): Node<"int">;
  bitOr(other: IntLike): Node<"int">;
  bitXor(other: IntLike): Node<"int">;
  shiftLeft(other: IntLike): Node<"int">;
  shiftRight(other: IntLike): Node<"int">;
  lessThan(other: IntLike): Node<"bool">;
  greaterThan(other: IntLike): Node<"bool">;
  lessThanEqual(other: IntLike): Node<"bool">;
  greaterThanEqual(other: IntLike): Node<"bool">;
  equal(other: IntLike): Node<"bool">;
  notEqual(other: IntLike): Node<"bool">;
}

interface UintOps {
  add(other: UintLike): Node<"uint">;
  sub(other: UintLike): Node<"uint">;
  mult(other: UintLike): Node<"uint">;
  div(other: UintLike): Node<"uint">;
  mod(other: UintLike): Node<"uint">;
  bitAnd(other: UintLike): Node<"uint">;
  bitOr(other: UintLike): Node<"uint">;
  bitXor(other: UintLike): Node<"uint">;
  shiftLeft(other: UintLike): Node<"uint">;
  shiftRight(other: UintLike): Node<"uint">;
  lessThan(other: UintLike): Node<"bool">;
  greaterThan(other: UintLike): Node<"bool">;
  lessThanEqual(other: UintLike): Node<"bool">;
  greaterThanEqual(other: UintLike): Node<"bool">;
  equal(other: UintLike): Node<"bool">;
  notEqual(other: UintLike): Node<"bool">;
}

interface SamplerOps {
  texture(coords: Vec2Like): Node<"vec4">;
  textureLod(coords: Vec2Like, lod: FloatLike): Node<"vec4">;
}

interface BoolOps {
  and(other: BooleanLike): Node<"bool">;
  or(other: BooleanLike): Node<"bool">;
  not(): Node<"bool">;
}

interface NodeMethods<A extends ShaderType> {
  toVar(): Node<A>;
  assign(value: BaseNode<A> | Node<A>): void;
}

// === NodeImpl - defines all methods, Node<A> hides typed subset ===
class NodeImpl<A extends ShaderType> implements BaseNode<A> {
  declare [__brand]: A;
  _t: string;
  type: string;
  params?: BaseNode<ShaderType>[];
  value?: unknown;

  constructor(config: { _t: string; type: string; params?: BaseNode<ShaderType>[]; value?: unknown }) {
    this._t = config._t;
    this.type = config.type;
    this.params = config.params;
    this.value = config.value;
  }

  // === ArithOps ===
  add(other: any): any { return op("add", this, other); }
  sub(other: any): any { return op("sub", this, other); }
  mult(other: any): any { return op("mult", this, other); }
  div(other: any): any { return op("div", this, other); }
  negate(): any { return op("negate", this); }

  // === FloatMathOps ===
  sin() { return op1("sin", this); }
  cos() { return op1("cos", this); }
  tan() { return op1("tan", this); }
  asin() { return op1("asin", this); }
  acos() { return op1("acos", this); }
  atan() { return op1("atan", this); }
  abs() { return op1("abs", this); }
  sign() { return op1("sign", this); }
  floor() { return op1("floor", this); }
  ceil() { return op1("ceil", this); }
  fract() { return op1("fract", this); }
  sqrt() { return op1("sqrt", this); }
  inversesqrt() { return op1("inversesqrt", this); }
  exp() { return op1("exp", this); }
  log() { return op1("log", this); }
  exp2() { return op1("exp2", this); }
  log2() { return op1("log2", this); }
  pow(e: any) { return op("pow", this, e); }
  min(other: any) { return op("min", this, other); }
  max(other: any) { return op("max", this, other); }
  mod(other: any) { return op("mod", this, other); }

  // === Comparison ops ===
  lessThan(other: any) { return comp("lessThan", this, other); }
  greaterThan(other: any) { return comp("greaterThan", this, other); }
  lessThanEqual(other: any) { return comp("lessThanEqual", this, other); }
  greaterThanEqual(other: any) { return comp("greaterThanEqual", this, other); }
  equal(other: any) { return comp("equal", this, other); }
  notEqual(other: any) { return comp("notEqual", this, other); }

  // === VecCommonOps ===
  dot(other: any): any { return op("dot", this, other); }
  length(): any { return op1("length", this); }
  normalize(): any { return op1("normalize", this); }
  distance(other: any): any { return op("distance", this, other); }
  reflect(normal: any): any { return op("reflect", this, normal); }
  refract(normal: any, eta: any): any { return op("refract", this, normal, eta); }
  clamp(minV: any, maxV: any): any { return op("clamp", this, minV, maxV); }
  mix(b: any, t: any): any { return op("mix", this, b, t); }
  step(edge: any): any { return op("step", edge, this); }
  smoothstep(edge0: any, edge1: any): any { return op("smoothstep", this, edge0, edge1); }

  // === Vec3Ops ===
  cross(other: any): any { return op("cross", this, other); }

  // === MatOps ===
  multVec(other: any): any {
    return node({ _t: "vec3", type: "matVecMul", params: [this as BaseNode<ShaderType>, wrapValue(other) as BaseNode<ShaderType>] });
  }
  multVec4(other: any): any {
    return node({ _t: "vec4", type: "matVecMul", params: [this as BaseNode<ShaderType>, wrapValue(other) as BaseNode<ShaderType>] });
  }
  inverse() { return op1("inverse", this); }
  transpose() { return op1("transpose", this); }

  // === IntOps ===
  bitAnd(other: any) { return op("bitAnd", this, other); }
  bitOr(other: any) { return op("bitOr", this, other); }
  bitXor(other: any) { return op("bitXor", this, other); }
  shiftLeft(other: any) { return op("shiftLeft", this, other); }
  shiftRight(other: any) { return op("shiftRight", this, other); }

  // === SamplerOps ===
  texture(coords: any): any {
    return node({
      _t: "vec4",
      type: "texture",
      params: [this as BaseNode<ShaderType>, wrapValue(coords) as BaseNode<ShaderType>],
    });
  }
  textureLod(coords: any, lod: any): any {
    return node({
      _t: "vec4",
      type: "textureLod",
      params: [this as BaseNode<ShaderType>, wrapValue(coords) as BaseNode<ShaderType>, wrapValue(lod) as BaseNode<ShaderType>],
    });
  }

  // === BoolOps ===
  and(other: any): any { return op("and", this, other); }
  or(other: any): any { return op("or", this, other); }
  not(): any { return op1("not", this); }

  // === NodeMethods ===
  assign(value: BaseNode<A>): void {
    assertBlockScope("assign", (blockScope) => {
      blockScope.push(new NodeImpl({
        _t: "void",
        type: "assign",
        params: [this, value as BaseNode<ShaderType>],
      }));
    });
  }

  toVar(): Node<A> {
    let v: Node<A>;
    assertBlockScope("toVar", (blockScope) => {
      let name = `_rmsl_${nextVarId++}`;
      v = var_(name, this._t) as Node<A>;
      blockScope.push(new NodeImpl({
        _t: "void",
        type: "let",
        params: [(v as BaseNode<ShaderType>), (this as BaseNode<ShaderType>)],
      }));
    });
    return v!;
  }

  // === Swizzles (gated by Node<"vec3"> / Node<"vec4"> type) ===
  get x(): Node<"float"> { return swizzle(this, "x"); }
  get y(): Node<"float"> { return swizzle(this, "y"); }
  get z(): Node<"float"> { return swizzle(this, "z"); }
  get w(): Node<"float"> { return swizzle(this, "w"); }
  get r(): Node<"float"> { return swizzle(this, "r"); }
  get g(): Node<"float"> { return swizzle(this, "g"); }
  get b(): Node<"float"> { return swizzle(this, "b"); }
  get a(): Node<"float"> { return swizzle(this, "a"); }
  get xy(): Node<"vec2"> { return swizzle(this, "xy"); }
  get xz(): Node<"vec2"> { return swizzle(this, "xz"); }
  get xw(): Node<"vec2"> { return swizzle(this, "xw"); }
  get yz(): Node<"vec2"> { return swizzle(this, "yz"); }
  get yw(): Node<"vec2"> { return swizzle(this, "yw"); }
  get zw(): Node<"vec2"> { return swizzle(this, "zw"); }
  get xyz(): Node<"vec3"> { return swizzle(this, "xyz"); }
  get xyw(): Node<"vec3"> { return swizzle(this, "xyw"); }
  get xzw(): Node<"vec3"> { return swizzle(this, "xzw"); }
  get yzw(): Node<"vec3"> { return swizzle(this, "yzw"); }
  get rgba(): Node<"vec4"> { return swizzle(this, "rgba"); }
  get rgb(): Node<"vec3"> { return swizzle(this, "rgb"); }
}

// Cast constructor so `new Node<T>(...)` returns `Node<T>` with conditional methods
export const Node = NodeImpl as unknown as new <A extends ShaderType>(config: {
  _t?: string;
  type: string;
  params?: BaseNode<ShaderType>[];
  value?: unknown;
}) => Node<A>;

// === Helpers ===
function node<A extends ShaderType>(config: {
  _t?: string;
  type: string;
  params?: BaseNode<ShaderType>[];
  value?: unknown;
}): Node<A> {
  return new Node<A>({ _t: config._t ?? config.type, ...config } as any);
}

function var_<A extends ShaderType>(varName: string, brandType: string): Node<A> {
  return new Node<A>({
    _t: brandType,
    type: "var",
    value: { varName, varType: brandType },
  });
}

function isNode(x: any): x is BaseNode<ShaderType> {
  return typeof x === 'object' && x !== null && '_t' in x && 'type' in x;
}

// === Value wrapping (convert raw JS -> Node for AST) ===
type ExtractType<V> =
  V extends FloatLike ? "float" :
  V extends Vec2Like ? "vec2" :
  V extends Vec3Like ? "vec3" :
  V extends Vec4Like ? "vec4" :
  V extends IntLike ? "int" :
  V extends UintLike ? "uint" :
  V extends BooleanLike ? "bool" :
  V extends Mat3Like ? "mat3" :
  V extends Mat4Like ? "mat4" :
  "void";

function wrapValue<V>(x: V): Node<ExtractType<V>> {
  if (x === undefined || x === null) {
    return node({ _t: "void", type: "void" }) as any;
  }
  if (typeof x === "boolean") {
    return node({ _t: "bool", type: "bool", value: x }) as any;
  }
  if (typeof x === "number") {
    if (Number.isInteger(x)) {
      return node({ _t: "int", type: "int", value: x }) as any;
    }
    return node({ _t: "float", type: "float", value: x }) as any;
  }
  if (Array.isArray(x)) {
    if (x.length === 3) {
      return node({ _t: "vec3", type: "vec3", value: x }) as any;
    }
    if (x.length === 4) {
      return node({ _t: "vec4", type: "vec4", value: x }) as any;
    }
    if (x.length === 2) {
      return node({ _t: "vec2", type: "vec2", value: x }) as any;
    }
    if (x.length === 9) {
      return node({ _t: "mat3", type: "mat3", value: x }) as any;
    }
    if (x.length === 16) {
      return node({ _t: "mat4", type: "mat4", value: x }) as any;
    }
    return node({ _t: "float", type: "float", value: x[0] }) as any;
  }
  return x as any;
}

function op(type: string, ...args: any[]): Node<ShaderType> {
  let params = args.map(a => wrapValue(a) as BaseNode<ShaderType>);
  let firstT = (params[0] as any)?._t || "float";
  return node({ _t: firstT, type, params });
}

function op1(type: string, a: any): Node<ShaderType> {
  let wrapped = wrapValue(a) as BaseNode<ShaderType>;
  let t = (wrapped as any)?._t || "float";
  return node({ _t: t, type, params: [wrapped] });
}

function comp(type: string, a: any, b: any): Node<"bool"> {
  let params = [wrapValue(a) as BaseNode<ShaderType>, wrapValue(b) as BaseNode<ShaderType>];
  return node({ _t: "bool", type, params }) as Node<"bool">;
}

function swizzle<A extends ShaderType>(src: BaseNode<ShaderType>, pattern: string): Node<A> {
  let outType = pattern.length === 1 ? "float" as const :
    pattern.length === 2 ? "vec2" as const :
    pattern.length === 3 ? "vec3" as const :
    pattern.length === 4 ? "vec4" as const : "float" as const;
  return node({
    _t: outType,
    type: "swizzle",
    params: [src],
    value: pattern,
  }) as Node<A>;
}

// === Block scope (same pattern as story-lang) ===
let blockScope: BaseNode<ShaderType>[] | undefined = undefined;
let nextVarId = 0;

export function assertBlockScope(
  fnName: string,
  fn: (blockScope: BaseNode<ShaderType>[]) => void,
) {
  if (blockScope === undefined) {
    throw new Error(`${fnName} must be called inside an Fn(() => { ... }) scope.`);
  }
  fn(blockScope);
}

// === Fn - macro that captures statements into a seq node ===
// Supports single return: Fn(() => { ...; return x; }) -> () => Node<A>
// Supports multi return: Fn(() => { ...; return [a, b]; }) -> () => [Node<A>, Node<B>]
export function Fn<T>(fn: () => T): () => T {
  return (() => {
    let oldBlockScope = blockScope;
    try {
      let scope: BaseNode<ShaderType>[] = [];
      blockScope = scope;
      let r = fn();
      let seqNode = node({
        _t: "void",
        type: "seq",
        params: [...scope, wrapValue(r as any) as BaseNode<ShaderType>],
      }) as any;
      if (Array.isArray(r)) {
        return r.map((_, i) => {
          return node({
            _t: "void",
            type: "seq",
            params: [...scope, wrapValue((r as any[])[i]) as BaseNode<ShaderType>],
          }) as Node<ShaderType>;
        }) as T;
      }
      return seqNode;
    } finally {
      blockScope = oldBlockScope;
    }
  });
}

function buildBlock(body: () => void): Node<"void"> {
  let oldBlockScope = blockScope;
  blockScope = [];
  try {
    body();
    return node({
      _t: "void",
      type: "seq",
      params: [...blockScope!],
    }) as Node<"void">;
  } finally {
    blockScope = oldBlockScope;
  }
}

// === Literal constructors (with overloads) ===
export function float(v: number | Node<"int">): Node<"float"> {
  if (isNode(v)) {
    return node({ _t: "float", type: "construct", params: [v] }) as Node<"float">;
  }
  return node({ _t: "float", type: "float", value: v }) as Node<"float">;
}
export function vec2(x: number | Node<"float"> | Node<"vec2"> | Node<"vec3"> | Node<"vec4">, y?: number): Node<"vec2"> {
  if (isNode(x)) {
    let params = [x as BaseNode<ShaderType>];
    if (y !== undefined) params.push(wrapValue(y) as BaseNode<ShaderType>);
    return node({ _t: "vec2", type: "construct", params }) as Node<"vec2">;
  }
  if (y === undefined) {
    return node({ _t: "vec2", type: "construct", params: [wrapValue(x)] }) as Node<"vec2">;
  }
  return node({ _t: "vec2", type: "vec2", value: [x, y] }) as Node<"vec2">;
}
export function vec3(x: number | Node<"float"> | Node<"vec3"> | Node<"vec4">, y?: number, z?: number): Node<"vec3"> {
  if (isNode(x)) {
    let params = [x as BaseNode<ShaderType>];
    if (y !== undefined) params.push(wrapValue(y) as BaseNode<ShaderType>);
    if (z !== undefined) params.push(wrapValue(z) as BaseNode<ShaderType>);
    return node({ _t: "vec3", type: "construct", params }) as Node<"vec3">;
  }
  if (y === undefined) {
    return node({ _t: "vec3", type: "construct", params: [wrapValue(x)] }) as Node<"vec3">;
  }
  return node({ _t: "vec3", type: "vec3", value: [x, y, z] }) as Node<"vec3">;
}
export function vec4(x: number | Node<"float"> | Node<"vec2"> | Node<"vec3"> | Node<"vec4">, y?: number, z?: number, w?: number): Node<"vec4"> {
  if (isNode(x)) {
    let params = [x as BaseNode<ShaderType>];
    if (y !== undefined) params.push(wrapValue(y) as BaseNode<ShaderType>);
    if (z !== undefined) params.push(wrapValue(z) as BaseNode<ShaderType>);
    if (w !== undefined) params.push(wrapValue(w) as BaseNode<ShaderType>);
    return node({ _t: "vec4", type: "construct", params }) as Node<"vec4">;
  }
  if (y === undefined) {
    return node({ _t: "vec4", type: "construct", params: [wrapValue(x)] }) as Node<"vec4">;
  }
  return node({ _t: "vec4", type: "vec4", value: [x, y, z!, w!] }) as Node<"vec4">;
}
export function int(v: number | Node<"float">): Node<"int"> {
  if (isNode(v)) {
    return node({ _t: "int", type: "construct", params: [v] }) as Node<"int">;
  }
  return node({ _t: "int", type: "int", value: v | 0 }) as Node<"int">;
}
export function boolean(v: boolean): Node<"bool"> {
  return node({ _t: "bool", type: "bool", value: v }) as Node<"bool">;
}
function makeMatConstructor<T extends ShaderType>(t: T, size: number, defaultVal: number[]): (...args: any[]) => Node<T> {
  return (...args: any[]): Node<T> => {
    if (args.length === 1 && isNode(args[0])) {
      return node({ _t: t, type: "construct", params: [args[0] as BaseNode<ShaderType>] }) as Node<T>;
    }
    if (args.length === 1 && typeof args[0] === "number") {
      return node({ _t: t, type: "construct", params: [wrapValue(args[0])] }) as Node<T>;
    }
    if (args.length === 0) {
      return node({ _t: t, type: t, value: defaultVal }) as Node<T>;
    }
    return node({ _t: t, type: t, value: args }) as Node<T>;
  };
}
export const mat2 = makeMatConstructor("mat2", 4, [1,0,0,1]);
export const mat2x3 = makeMatConstructor("mat2x3", 6, [1,0,0,0,1,0]);
export const mat2x4 = makeMatConstructor("mat2x4", 8, [1,0,0,0,0,1,0,0]);
export const mat3x2 = makeMatConstructor("mat3x2", 6, [1,0,0,0,1,0]);
export function mat3(...args: any[]): Node<"mat3"> {
  if (args.length === 1 && isNode(args[0])) {
    return node({ _t: "mat3", type: "construct", params: [args[0] as BaseNode<ShaderType>] }) as Node<"mat3">;
  }
  if (args.length === 3 && args.every((a: any) => isNode(a))) {
    return node({ _t: "mat3", type: "construct", params: args.map((a: any) => a as BaseNode<ShaderType>) }) as Node<"mat3">;
  }
  if (args.length === 1 && typeof args[0] === "number") {
    return node({ _t: "mat3", type: "construct", params: [wrapValue(args[0])] }) as Node<"mat3">;
  }
  if (args.length === 0) {
    return node({ _t: "mat3", type: "mat3", value: [1,0,0,0,1,0,0,0,1] }) as Node<"mat3">;
  }
  return node({ _t: "mat3", type: "mat3", value: args }) as Node<"mat3">;
}
export const mat3x4 = makeMatConstructor("mat3x4", 12, [1,0,0,0,0,1,0,0,0,0,1,0]);
export const mat4x2 = makeMatConstructor("mat4x2", 8, [1,0,0,0,0,1,0,0]);
export const mat4x3 = makeMatConstructor("mat4x3", 12, [1,0,0,0,0,1,0,0,0,0,1,0]);
export function mat4(...args: any[]): Node<"mat4"> {
  if (args.length === 1 && isNode(args[0])) {
    return node({ _t: "mat4", type: "construct", params: [args[0] as BaseNode<ShaderType>] }) as Node<"mat4">;
  }
  if (args.length === 4 && args.every((a: any) => isNode(a))) {
    return node({ _t: "mat4", type: "construct", params: args.map((a: any) => a as BaseNode<ShaderType>) }) as Node<"mat4">;
  }
  if (args.length === 1 && typeof args[0] === "number") {
    return node({ _t: "mat4", type: "construct", params: [wrapValue(args[0])] }) as Node<"mat4">;
  }
  if (args.length === 0) {
    return node({ _t: "mat4", type: "mat4", value: [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1] }) as Node<"mat4">;
  }
  return node({ _t: "mat4", type: "mat4", value: args }) as Node<"mat4">;
}

// === Uniforms, Attributes, Varyings ===
let nextUniformId = 0;
let nextAttrId = 0;
let nextVaryingId = 0;

export function uniform<T extends ShaderType>(shaderType: T): Node<T> {
  let id = nextUniformId++;
  return node({
    _t: shaderType,
    type: "uniform",
    value: { id, slot: `_rmsl_u${id}`, shaderType },
  }) as Node<T>;
}

export function attribute<T extends ShaderType>(shaderType: T): Node<T> {
  let id = nextAttrId++;
  return node({
    _t: shaderType,
    type: "attribute",
    value: { id, slot: `_rmsl_a${id}`, shaderType },
  }) as Node<T>;
}

export function varying<T extends ShaderType>(shaderType: T): Node<T> {
  let id = nextVaryingId++;
  return node({
    _t: shaderType,
    type: "varying",
    value: { id, slot: `_rmsl_v${id}`, shaderType },
  }) as Node<T>;
}

// === Outputs ===
let nextOutputId = 0;

export function output<T extends ShaderType>(shaderType: T): Node<T> {
  let id = nextOutputId++;
  return node({
    _t: shaderType,
    type: "output",
    value: { id, slot: `_rmsl_o${id}`, shaderType, location: id },
  }) as Node<T>;
}

export function builtinPosition(): Node<"vec4"> {
  return node({
    _t: "vec4",
    type: "builtinPosition",
  }) as Node<"vec4">;
}

// === Control Flow ===

type ElseIfChain = {
  ElseIf: (cond: BooleanLike, body: () => void) => ElseIfChain;
  Else: (body: () => void) => void;
};

export function If(cond: BooleanLike, body: () => void): ElseIfChain {
  let ifNode = node({
    _t: "void",
    type: "if",
    params: [
      wrapValue(cond) as BaseNode<ShaderType>,
      buildBlock(body) as BaseNode<ShaderType>,
    ],
  });
  assertBlockScope("If", (scope) => { scope.push(ifNode); });
  let deepestIf = ifNode;
  const chain: ElseIfChain = {
    ElseIf: (nextCond, nextBody) => {
      let nextIf = node({
        _t: "void",
        type: "if",
        params: [
          wrapValue(nextCond) as BaseNode<ShaderType>,
          buildBlock(nextBody) as BaseNode<ShaderType>,
        ],
      });
      deepestIf.params![2] = nextIf as BaseNode<ShaderType>;
      deepestIf = nextIf;
      return chain;
    },
    Else: (elseBody) => {
      deepestIf.params![2] = buildBlock(elseBody) as BaseNode<ShaderType>;
    },
  };
  return chain;
}

export function For(
  init: () => void,
  cond: () => BooleanLike,
  update: () => void,
  body: () => void,
): void {
  assertBlockScope("For", (scope) => {
    let initNode = buildBlock(init);
    let condNode = wrapValue(cond()) as BaseNode<ShaderType>;
    let updateNode = buildBlock(update);
    let bodyNode = buildBlock(body);
    scope.push(node({
      _t: "void",
      type: "for",
      params: [initNode, condNode, updateNode, bodyNode],
    }));
  });
}

export function While(cond: () => BooleanLike, body: () => void): void {
  assertBlockScope("While", (scope) => {
    let condNode = wrapValue(cond()) as BaseNode<ShaderType>;
    let bodyNode = buildBlock(body);
    scope.push(node({
      _t: "void",
      type: "while",
      params: [condNode, bodyNode],
    }));
  });
}

export function discard(): void {
  assertBlockScope("discard", (scope) => {
    scope.push(node({ _t: "void", type: "discard" }));
  });
}

export function break_(): void {
  assertBlockScope("break", (scope) => {
    scope.push(node({ _t: "void", type: "break" }));
  });
}

export function continue_(): void {
  assertBlockScope("continue", (scope) => {
    scope.push(node({ _t: "void", type: "continue" }));
  });
}

// ==== COMPILERS ====

// ========== GLSL Compiler ==========
interface CompileCtx {
  nextId: number;
  shaderStage: "vertex" | "fragment";
  uniforms: Map<number, { type: string; slot: string }>;
  attributes: Map<number, { type: string; slot: string }>;
  varyings: Map<number, { type: string; slot: string }>;
  outputs: Map<number, { type: string; slot: string; location: number }>;
  wgslSamplers: Map<string, { textureSlot: string; samplerSlot: string }>;
  varDefs: Set<string>;
  inFn: boolean;
}

let typeToGLSL: Record<string, string> = {
  float: "float", vec2: "vec2", vec3: "vec3", vec4: "vec4",
  int: "int", uint: "uint", bool: "bool",
  mat2: "mat2", mat2x3: "mat2x3", mat2x4: "mat2x4",
  mat3x2: "mat3x2", mat3: "mat3", mat3x4: "mat3x4",
  mat4x2: "mat4x2", mat4x3: "mat4x3", mat4: "mat4",
  sampler2D: "sampler2D", samplerCube: "samplerCube",
  void: "void",
};

function glslType(brand: any): string {
  return typeToGLSL[brand as string] ?? "float";
}

// === Constant folding ===
function isLeafLiteral(n: BaseNode<ShaderType>): boolean {
  return (n.type === "float" || n.type === "int" || n.type === "uint" || n.type === "bool") && !n.params;
}

function tryFold(n: BaseNode<ShaderType>): BaseNode<ShaderType> | null {
  let params = n.params ?? [];
  if (!params.every(isLeafLiteral)) return null;
  let p0 = params[0]?.value;
  let p1 = params[1]?.value;
  let t = n._t;
  if (t === "float" || t === "int" || t === "uint") {
    let a = p0 as number;
    let b = p1 as number;
    switch (n.type) {
      case "add": return mkNode({ _t: t, type: t, value: t === "int" || t === "uint" ? (a + b) | 0 : a + b });
      case "sub": return mkNode({ _t: t, type: t, value: t === "int" || t === "uint" ? (a - b) | 0 : a - b });
      case "mult": return mkNode({ _t: t, type: t, value: t === "int" || t === "uint" ? (a * b) | 0 : a * b });
      case "div": return mkNode({ _t: t, type: t, value: t === "int" || t === "uint" ? (a / b) | 0 : a / b });
      case "negate": return mkNode({ _t: t, type: t, value: t === "int" || t === "uint" ? (-a) | 0 : -a });
      case "mod": return mkNode({ _t: t, type: t, value: t === "int" || t === "uint" ? (a % b) | 0 : a % b });
      case "sin": return mkNode({ _t: t, type: t, value: Math.sin(a) });
      case "cos": return mkNode({ _t: t, type: t, value: Math.cos(a) });
      case "tan": return mkNode({ _t: t, type: t, value: Math.tan(a) });
      case "asin": return mkNode({ _t: t, type: t, value: Math.asin(a) });
      case "acos": return mkNode({ _t: t, type: t, value: Math.acos(a) });
      case "atan": return mkNode({ _t: t, type: t, value: Math.atan(a) });
      case "abs": return mkNode({ _t: t, type: t, value: Math.abs(a) });
      case "sign": return mkNode({ _t: t, type: t, value: Math.sign(a) });
      case "floor": return mkNode({ _t: t, type: t, value: Math.floor(a) });
      case "ceil": return mkNode({ _t: t, type: t, value: Math.ceil(a) });
      case "fract": return mkNode({ _t: t, type: t, value: a - Math.floor(a) });
      case "sqrt": return mkNode({ _t: t, type: t, value: Math.sqrt(a) });
      case "inversesqrt": return mkNode({ _t: t, type: t, value: 1 / Math.sqrt(a) });
      case "exp": return mkNode({ _t: t, type: t, value: Math.exp(a) });
      case "log": return mkNode({ _t: t, type: t, value: Math.log(a) });
      case "exp2": return mkNode({ _t: t, type: t, value: Math.pow(2, a) });
      case "log2": return mkNode({ _t: t, type: t, value: Math.log2(a) });
      case "pow": return mkNode({ _t: t, type: t, value: Math.pow(a, b) });
      case "min": return mkNode({ _t: t, type: t, value: Math.min(a, b) });
      case "max": return mkNode({ _t: t, type: t, value: Math.max(a, b) });
    }
  }
  return null;
}

function mkNode(config: { _t?: string; type: string; params?: BaseNode<ShaderType>[]; value?: unknown }): BaseNode<ShaderType> {
  return new NodeImpl({ _t: config._t ?? config.type, type: config.type, params: config.params, value: config.value }) as BaseNode<ShaderType>;
}

function compileGLSLStage(
  node: BaseNode<ShaderType> | ShaderType extends never ? never : any,
  ctx: CompileCtx,
): { decls: string[]; body: string[]; expr: string } {
  if (node === undefined || node === null) {
    return { decls: [], body: [], expr: "0.0" };
  }
  if (typeof node === "boolean") {
    return { decls: [], body: [], expr: node ? "true" : "false" };
  }
  if (typeof node === "number") {
    return { decls: [], body: [], expr: node.toString() };
  }
  if (Array.isArray(node)) {
    return { decls: [], body: [], expr: `vec3(${node.join(", ")})` };
  }

  // Constant folding
  let folded = tryFold(node);
  if (folded) node = folded;

  switch (node.type) {
    case "float": return { decls: [], body: [], expr: String(node.value) };
    case "int": return { decls: [], body: [], expr: String(node.value) };
    case "uint": return { decls: [], body: [], expr: String(node.value) + "u" };
    case "bool": return { decls: [], body: [], expr: node.value ? "true" : "false" };
    case "vec2": return { decls: [], body: [], expr: `vec2(${(node.value as number[]).join(", ")})` };
    case "vec3": return { decls: [], body: [], expr: `vec3(${(node.value as number[]).join(", ")})` };
    case "vec4": return { decls: [], body: [], expr: `vec4(${(node.value as number[]).join(", ")})` };
    case "mat2": return { decls: [], body: [], expr: `mat2(${(node.value as number[]).join(", ")})` };
    case "mat2x3": return { decls: [], body: [], expr: `mat2x3(${(node.value as number[]).join(", ")})` };
    case "mat2x4": return { decls: [], body: [], expr: `mat2x4(${(node.value as number[]).join(", ")})` };
    case "mat3x2": return { decls: [], body: [], expr: `mat3x2(${(node.value as number[]).join(", ")})` };
    case "mat3": return { decls: [], body: [], expr: `mat3(${(node.value as number[]).join(", ")})` };
    case "mat3x4": return { decls: [], body: [], expr: `mat3x4(${(node.value as number[]).join(", ")})` };
    case "mat4x2": return { decls: [], body: [], expr: `mat4x2(${(node.value as number[]).join(", ")})` };
    case "mat4x3": return { decls: [], body: [], expr: `mat4x3(${(node.value as number[]).join(", ")})` };
    case "mat4": return { decls: [], body: [], expr: `mat4(${(node.value as number[]).join(", ")})` };
    case "void": return { decls: [], body: [], expr: "0.0" };

    case "construct": {
      let params = (node.params ?? []).map((p: any) => compileGLSLStage(p, ctx));
      let t = glslType(node._t as string);
      let args = params.map((p: any) => p.expr).join(", ");
      return {
        decls: params.flatMap((p: any) => p.decls),
        body: params.flatMap((p: any) => p.body),
        expr: `${t}(${args})`,
      };
    }

    case "var": {
      let varName = (node.value as any).varName;
      return { decls: [], body: [], expr: varName };
    }

    case "uniform": {
      let v = node.value as any;
      if (!ctx.uniforms.has(v.id)) {
        ctx.uniforms.set(v.id, { type: glslType(v.shaderType), slot: v.slot });
      }
      return { decls: [], body: [], expr: v.slot };
    }

    case "attribute": {
      let v = node.value as any;
      if (!ctx.attributes.has(v.id)) {
        ctx.attributes.set(v.id, { type: glslType(v.shaderType), slot: v.slot });
      }
      return { decls: [], body: [], expr: v.slot };
    }

    case "varying": {
      let v = node.value as any;
      if (!ctx.varyings.has(v.id)) {
        ctx.varyings.set(v.id, { type: glslType(v.shaderType), slot: v.slot });
      }
      return { decls: [], body: [], expr: v.slot };
    }

    case "output": {
      let v = node.value as any;
      if (!ctx.outputs.has(v.id)) {
        ctx.outputs.set(v.id, { type: glslType(v.shaderType), slot: v.slot, location: v.location });
      }
      return { decls: [], body: [], expr: v.slot };
    }

    case "builtinPosition": {
      return { decls: [], body: [], expr: "gl_Position" };
    }

    case "swizzle": {
      let src = compileGLSLStage(node.params![0], ctx);
      let pattern = node.value as string;
      return { decls: src.decls, body: src.body, expr: `${src.expr}.${pattern}` };
    }

    case "negate": {
      let a = compileGLSLStage(node.params![0], ctx);
      return { decls: a.decls, body: a.body, expr: `(-${a.expr})` };
    }
    case "not": {
      let a = compileGLSLStage(node.params![0], ctx);
      return { decls: a.decls, body: a.body, expr: `(!${a.expr})` };
    }

    // Binary math ops (same pattern for all)
    case "add": return binaryGLSL(node, ctx, "+");
    case "sub": return binaryGLSL(node, ctx, "-");
    case "mult": return binaryGLSL(node, ctx, "*");
    case "div": return binaryGLSL(node, ctx, "/");
    case "mod": return binaryGLSL(node, ctx, "%");
    case "pow": return binaryGLSL(node, ctx, "pow", true);
    case "min": return binaryGLSL(node, ctx, "min", true);
    case "max": return binaryGLSL(node, ctx, "max", true);
    case "dot": return binaryGLSL(node, ctx, "dot", true);
    case "cross": return binaryGLSL(node, ctx, "cross", true);
    case "distance": return binaryGLSL(node, ctx, "distance", true);
    case "reflect": return binaryGLSL(node, ctx, "reflect", true);
    case "refract": return binaryGLSL(node, ctx, "refract", true);
    case "mix": return binaryGLSL(node, ctx, "mix", true);
    case "step": return binaryGLSL(node, ctx, "step", true);
    case "smoothstep": return binaryGLSL(node, ctx, "smoothstep", true);
    case "clamp": return binaryGLSL(node, ctx, "clamp", true);
    // Comparison ops
    case "lessThan": return comparisonGLSL(node, ctx, "<", "lessThan");
    case "greaterThan": return comparisonGLSL(node, ctx, ">", "greaterThan");
    case "lessThanEqual": return comparisonGLSL(node, ctx, "<=", "lessThanEqual");
    case "greaterThanEqual": return comparisonGLSL(node, ctx, ">=", "greaterThanEqual");
    case "equal": return comparisonGLSL(node, ctx, "==", "equal");
    case "notEqual": return comparisonGLSL(node, ctx, "!=", "notEqual");

    case "and": return binaryGLSL(node, ctx, "&&");
    case "or": return binaryGLSL(node, ctx, "||");
    case "bitAnd": return binaryGLSL(node, ctx, "&");
    case "bitOr": return binaryGLSL(node, ctx, "|");
    case "bitXor": return binaryGLSL(node, ctx, "^");
    case "shiftLeft": return binaryGLSL(node, ctx, "<<");
    case "shiftRight": return binaryGLSL(node, ctx, ">>");

    case "matVecMul": {
      let mat = compileGLSLStage(node.params![0], ctx);
      let vec = compileGLSLStage(node.params![1], ctx);
      let matType = (node.params![0] as any)?._t || "mat4";
      let vecType = (node.params![1] as any)?._t || "vec3";
      if (matType === "mat4" && vecType === "vec3") {
        return {
          decls: [...mat.decls, ...vec.decls],
          body: [...mat.body, ...vec.body],
          expr: `(${mat.expr} * vec4(${vec.expr}, 1.0)).xyz`,
        };
      }
      return {
        decls: [...mat.decls, ...vec.decls],
        body: [...mat.body, ...vec.body],
        expr: `(${mat.expr} * ${vec.expr})`,
      };
    }

    // Unary math ops
    case "sin": return unaryGLSL(node, ctx, "sin");
    case "cos": return unaryGLSL(node, ctx, "cos");
    case "tan": return unaryGLSL(node, ctx, "tan");
    case "asin": return unaryGLSL(node, ctx, "asin");
    case "acos": return unaryGLSL(node, ctx, "acos");
    case "atan": return unaryGLSL(node, ctx, "atan");
    case "abs": return unaryGLSL(node, ctx, "abs");
    case "sign": return unaryGLSL(node, ctx, "sign");
    case "floor": return unaryGLSL(node, ctx, "floor");
    case "ceil": return unaryGLSL(node, ctx, "ceil");
    case "fract": return unaryGLSL(node, ctx, "fract");
    case "sqrt": return unaryGLSL(node, ctx, "sqrt");
    case "inversesqrt": return unaryGLSL(node, ctx, "inversesqrt");
    case "exp": return unaryGLSL(node, ctx, "exp");
    case "log": return unaryGLSL(node, ctx, "log");
    case "exp2": return unaryGLSL(node, ctx, "exp2");
    case "log2": return unaryGLSL(node, ctx, "log2");
    case "normalize": return unaryGLSL(node, ctx, "normalize");
    case "length": return unaryGLSL(node, ctx, "length");
    case "transpose": return unaryGLSL(node, ctx, "transpose");
    case "inverse": return unaryGLSL(node, ctx, "inverse");

    case "texture": return binaryGLSL(node, ctx, "texture", true);
    case "textureLod": {
      let sampler = compileGLSLStage(node.params![0], ctx);
      let coords = compileGLSLStage(node.params![1], ctx);
      let lod = compileGLSLStage(node.params![2], ctx);
      return {
        decls: [...sampler.decls, ...coords.decls, ...lod.decls],
        body: [...sampler.body, ...coords.body, ...lod.body],
        expr: `textureLod(${sampler.expr}, ${coords.expr}, ${lod.expr})`,
      };
    }

    case "let": {
      let lhs = compileGLSLStage(node.params![0], ctx);
      let rhs = compileGLSLStage(node.params![1], ctx);
      let vt = (node.params![0] as any)._t || "float";
      let t = glslType(vt);
      return {
        decls: [...lhs.decls, ...rhs.decls],
        body: [...lhs.body, ...rhs.body, `${t} ${lhs.expr} = ${rhs.expr};`],
        expr: lhs.expr,
      };
    }

    case "assign": {
      let lhs = compileGLSLStage(node.params![0], ctx);
      let rhs = compileGLSLStage(node.params![1], ctx);
      return {
        decls: [...lhs.decls, ...rhs.decls],
        body: [...lhs.body, ...rhs.body, `${lhs.expr} = ${rhs.expr};`],
        expr: lhs.expr,
      };
    }

    case "seq": {
      let params = node.params ?? [];
      let allDecls: string[] = [];
      let allBody: string[] = [];
      let expr = "0.0";
      for (let p of params) {
        let r = compileGLSLStage(p, ctx);
        allDecls.push(...r.decls);
        allBody.push(...r.body);
        expr = r.expr;
      }
      return { decls: allDecls, body: allBody, expr };
    }

    case "if": {
      let cond = compileGLSLStage(node.params![0], ctx);
      let body = compileGLSLStage(node.params![1], ctx);
      let elseBody = node.params!.length >= 3 && node.params![2] !== undefined
        ? compileGLSLStage(node.params![2], ctx)
        : { decls: [] as string[], body: [] as string[], expr: "" };
      let lines: string[] = [
        ...cond.body,
        `if (${cond.expr}) {`,
        ...body.body.map(l => "  " + l),
        "}",
      ];
      if (elseBody.body.length > 0) {
        lines.push("else {");
        lines.push(...elseBody.body.map(l => "  " + l));
        lines.push("}");
      }
      return {
        decls: [...cond.decls, ...body.decls, ...elseBody.decls],
        body: lines,
        expr: "0.0",
      };
    }

    case "for": {
      let init = compileGLSLStage(node.params![0], ctx);
      let cond = compileGLSLStage(node.params![1], ctx);
      let update = compileGLSLStage(node.params![2], ctx);
      let body = compileGLSLStage(node.params![3], ctx);
      let initExpr = init.expr;
      let initBody = init.body;
      if (init.body.length > 0) {
        let lastStmt = init.body[init.body.length - 1];
        if (lastStmt.endsWith(';')) {
          initExpr = lastStmt.slice(0, -1);
          initBody = init.body.slice(0, -1);
        }
      }
      return {
        decls: [...init.decls, ...cond.decls, ...update.decls, ...body.decls],
        body: [
          ...initBody,
          ...cond.body,
          `for (${initExpr}; ${cond.expr}; ${update.expr}) {`,
          ...body.body.map(l => "  " + l),
          "}",
        ],
        expr: "0.0",
      };
    }

    case "while": {
      let cond = compileGLSLStage(node.params![0], ctx);
      let body = compileGLSLStage(node.params![1], ctx);
      return {
        decls: [...cond.decls, ...body.decls],
        body: [
          ...cond.body,
          `while (${cond.expr}) {`,
          ...body.body.map(l => "  " + l),
          "}",
        ],
        expr: "0.0",
      };
    }

    case "discard": {
      return { decls: [], body: ["discard;"], expr: "0.0" };
    }

    case "break": {
      return { decls: [], body: ["break;"], expr: "0.0" };
    }

    case "continue": {
      return { decls: [], body: ["continue;"], expr: "0.0" };
    }

    default:
      console.warn(`[RMSL] Unsupported node type in GLSL compiler: "${node.type}"`);
      return { decls: [], body: [], expr: "0.0" };
  }
}

function binaryGLSL(
  node: BaseNode<ShaderType>,
  ctx: CompileCtx,
  op: string,
  isFn?: boolean,
): { decls: string[]; body: string[]; expr: string } {
  let lhs = compileGLSLStage(node.params![0], ctx);
  let rhs = compileGLSLStage(node.params![1], ctx);
  let expr = isFn
    ? `${op}(${lhs.expr}, ${rhs.expr})`
    : `(${lhs.expr} ${op} ${rhs.expr})`;
  return {
    decls: [...lhs.decls, ...rhs.decls],
    body: [...lhs.body, ...rhs.body],
    expr,
  };
}

function comparisonGLSL(
  node: BaseNode<ShaderType>,
  ctx: CompileCtx,
  op: string,
  fnName: string,
): { decls: string[]; body: string[]; expr: string } {
  let a = compileGLSLStage(node.params![0], ctx);
  let b = compileGLSLStage(node.params![1], ctx);
  let type = (node.params![0] as any)?._t || "float";
  let isVec = type === "vec2" || type === "vec3" || type === "vec4";
  let expr = isVec ? `${fnName}(${a.expr}, ${b.expr})` : `(${a.expr} ${op} ${b.expr})`;
  return {
    decls: [...a.decls, ...b.decls],
    body: [...a.body, ...b.body],
    expr,
  };
}

function unaryGLSL(
  node: BaseNode<ShaderType>,
  ctx: CompileCtx,
  fn: string,
): { decls: string[]; body: string[]; expr: string } {
  let a = compileGLSLStage(node.params![0], ctx);
  return {
    decls: a.decls,
    body: a.body,
    expr: `${fn}(${a.expr})`,
  };
}

function compileGLSLWithStage(
  root: Node<ShaderType> | Node<ShaderType>[],
  shaderStage: "vertex" | "fragment",
): string {
  let ctx: CompileCtx = {
    nextId: 0,
    shaderStage,
    uniforms: new Map(),
    attributes: new Map(),
    varyings: new Map(),
    outputs: new Map(),
    wgslSamplers: new Map(),
    varDefs: new Set(),
    inFn: false,
  };

  let nodes = Array.isArray(root) ? root : [root];
  let results = nodes.map(n => compileGLSLStage(n, ctx));
  let allBody: string[] = [];
  let lastExpr = "0.0";
  for (let r of results) {
    allBody.push(...r.decls, ...r.body);
    lastExpr = r.expr;
  }

  let lines: string[] = [];
  lines.push("#version 300 es");
  lines.push("precision highp float;");
  lines.push("");

  ctx.uniforms.forEach((info) => {
    lines.push(`uniform ${info.type} ${info.slot};`);
  });
  ctx.attributes.forEach((info) => {
    lines.push(`in ${info.type} ${info.slot};`);
  });
  ctx.varyings.forEach((info) => {
    if (shaderStage === "vertex") {
      lines.push(`out ${info.type} ${info.slot};`);
    } else {
      lines.push(`in ${info.type} ${info.slot};`);
    }
  });
  ctx.outputs.forEach((info) => {
    lines.push(`layout(location=${info.location}) out ${info.type} ${info.slot};`);
  });
  if (ctx.uniforms.size > 0 || ctx.attributes.size > 0 || ctx.outputs.size > 0) {
    lines.push("");
  }

  if (shaderStage === "vertex") {
    lines.push("void main(void) {");
    for (let line of allBody) {
      lines.push("  " + line);
    }
    if (lastExpr !== "0.0") {
      lines.push(`  gl_Position = ${lastExpr};`);
    }
    lines.push("}");
  } else {
    lines.push("void main(void) {");
    for (let line of allBody) {
      lines.push("  " + line);
    }
    if (ctx.outputs.size > 0) {
      ctx.outputs.forEach((info, id) => {
        lines.push(`  ${info.slot} = ${lastExpr};`);
      });
    }
    lines.push("}");
  }
  return lines.join("\n");
}

export const compileGLSL: {
  (root: Node<ShaderType> | Node<ShaderType>[]): string;
  vertex(root: Node<ShaderType> | Node<ShaderType>[]): string;
  fragment(root: Node<ShaderType> | Node<ShaderType>[]): string;
} = Object.assign(
  (root: Node<ShaderType> | Node<ShaderType>[]) => compileGLSLWithStage(root, "fragment"),
  {
    vertex: (root: Node<ShaderType> | Node<ShaderType>[]) => compileGLSLWithStage(root, "vertex"),
    fragment: (root: Node<ShaderType> | Node<ShaderType>[]) => compileGLSLWithStage(root, "fragment"),
  },
);

// ========== WGSL Compiler ==========
let typeToWGSL: Record<string, string> = {
  float: "f32", vec2: "vec2<f32>", vec3: "vec3<f32>", vec4: "vec4<f32>",
  int: "i32", uint: "u32", bool: "bool",
  mat2: "mat2x2<f32>", mat2x3: "mat2x3<f32>", mat2x4: "mat2x4<f32>",
  mat3x2: "mat3x2<f32>", mat3: "mat3x3<f32>", mat3x4: "mat3x4<f32>",
  mat4x2: "mat4x2<f32>", mat4x3: "mat4x3<f32>", mat4: "mat4x4<f32>",
  sampler2D: "texture_2d<f32>", samplerCube: "texture_cube<f32>",
  void: "void",
};

function wgslType(brand: any): string {
  return typeToWGSL[brand as string] ?? "f32";
}

function compileWGSLStage(
  node: BaseNode<ShaderType> | any,
  ctx: CompileCtx,
): { decls: string[]; body: string[]; expr: string } {
  if (node === undefined || node === null) {
    return { decls: [], body: [], expr: "0.0" };
  }
  if (typeof node === "boolean") {
    return { decls: [], body: [], expr: node ? "true" : "false" };
  }
  if (typeof node === "number") {
    return { decls: [], body: [], expr: Number.isInteger(node) ? `${node}i` : `${node}f` };
  }
  if (Array.isArray(node)) {
    return { decls: [], body: [], expr: `vec3<f32>(${node.join(", ")})` };
  }

  // Constant folding
  let folded = tryFold(node);
  if (folded) node = folded;

  switch (node.type) {
    case "float": return { decls: [], body: [], expr: `${node.value}f` };
    case "int": return { decls: [], body: [], expr: `${node.value}i` };
    case "uint": return { decls: [], body: [], expr: `${node.value}u` };
    case "bool": return { decls: [], body: [], expr: node.value ? "true" : "false" };
    case "vec2": return { decls: [], body: [], expr: `vec2<f32>(${(node.value as number[]).join(", ")})` };
    case "vec3": return { decls: [], body: [], expr: `vec3<f32>(${(node.value as number[]).join(", ")})` };
    case "vec4": return { decls: [], body: [], expr: `vec4<f32>(${(node.value as number[]).join(", ")})` };
    case "mat2": return { decls: [], body: [], expr: `mat2x2<f32>(${(node.value as number[]).join(", ")})` };
    case "mat2x3": return { decls: [], body: [], expr: `mat2x3<f32>(${(node.value as number[]).join(", ")})` };
    case "mat2x4": return { decls: [], body: [], expr: `mat2x4<f32>(${(node.value as number[]).join(", ")})` };
    case "mat3x2": return { decls: [], body: [], expr: `mat3x2<f32>(${(node.value as number[]).join(", ")})` };
    case "mat3": return { decls: [], body: [], expr: `mat3x3<f32>(${(node.value as number[]).join(", ")})` };
    case "mat3x4": return { decls: [], body: [], expr: `mat3x4<f32>(${(node.value as number[]).join(", ")})` };
    case "mat4x2": return { decls: [], body: [], expr: `mat4x2<f32>(${(node.value as number[]).join(", ")})` };
    case "mat4x3": return { decls: [], body: [], expr: `mat4x3<f32>(${(node.value as number[]).join(", ")})` };
    case "mat4": return { decls: [], body: [], expr: `mat4x4<f32>(${(node.value as number[]).join(", ")})` };
    case "void": return { decls: [], body: [], expr: "0.0" };

    case "construct": {
      let params = (node.params ?? []).map((p: any) => compileWGSLStage(p, ctx));
      let t = wgslType(node._t as string);
      let args = params.map((p: any) => p.expr).join(", ");
      return {
        decls: params.flatMap((p: any) => p.decls),
        body: params.flatMap((p: any) => p.body),
        expr: `${t}(${args})`,
      };
    }

    case "var": {
      let varName = (node.value as any).varName;
      return { decls: [], body: [], expr: varName };
    }

    case "uniform": {
      let v = node.value as any;
      if (!ctx.uniforms.has(v.id)) {
        ctx.uniforms.set(v.id, { type: wgslType(v.shaderType), slot: v.slot });
      }
      return { decls: [], body: [], expr: v.slot };
    }

    case "attribute": {
      let v = node.value as any;
      if (!ctx.attributes.has(v.id)) {
        ctx.attributes.set(v.id, { type: wgslType(v.shaderType), slot: v.slot });
      }
      return { decls: [], body: [], expr: ctx.shaderStage === "vertex" ? `input.${v.slot}` : v.slot };
    }

    case "varying": {
      let v = node.value as any;
      if (!ctx.varyings.has(v.id)) {
        ctx.varyings.set(v.id, { type: wgslType(v.shaderType), slot: v.slot });
      }
      return { decls: [], body: [], expr: v.slot };
    }

    case "output": {
      let v = node.value as any;
      if (!ctx.outputs.has(v.id)) {
        ctx.outputs.set(v.id, { type: wgslType(v.shaderType), slot: v.slot, location: v.location });
      }
      return { decls: [], body: [], expr: v.slot };
    }

    case "builtinPosition": {
      return { decls: [], body: [], expr: "position" };
    }

    case "swizzle": {
      let src = compileWGSLStage(node.params![0], ctx);
      let pattern = node.value as string;
      return { decls: src.decls, body: src.body, expr: `${src.expr}.${pattern}` };
    }

    case "negate": {
      let a = compileWGSLStage(node.params![0], ctx);
      return { decls: a.decls, body: a.body, expr: `(-${a.expr})` };
    }
    case "not": {
      let a = compileWGSLStage(node.params![0], ctx);
      return { decls: a.decls, body: a.body, expr: `(!${a.expr})` };
    }

    case "add": return binaryWGSL(node, ctx, "+");
    case "sub": return binaryWGSL(node, ctx, "-");
    case "mult": return binaryWGSL(node, ctx, "*");
    case "div": return binaryWGSL(node, ctx, "/");
    case "mod": return binaryWGSL(node, ctx, "%");
    case "pow": return binaryWGSL(node, ctx, "pow", true);
    case "min": return binaryWGSL(node, ctx, "min", true);
    case "max": return binaryWGSL(node, ctx, "max", true);
    case "dot": return binaryWGSL(node, ctx, "dot", true);
    case "cross": return binaryWGSL(node, ctx, "cross", true);
    case "distance": return binaryWGSL(node, ctx, "distance", true);
    case "reflect": return binaryWGSL(node, ctx, "reflect", true);
    case "refract": return binaryWGSL(node, ctx, "refract", true);
    case "mix": return binaryWGSL(node, ctx, "mix", true);
    case "step": return binaryWGSL(node, ctx, "step", true);
    case "smoothstep": return binaryWGSL(node, ctx, "smoothstep", true);
    case "clamp": return binaryWGSL(node, ctx, "clamp", true);
    // Comparison ops
    case "lessThan": return binaryWGSL(node, ctx, "<");
    case "greaterThan": return binaryWGSL(node, ctx, ">");
    case "lessThanEqual": return binaryWGSL(node, ctx, "<=");
    case "greaterThanEqual": return binaryWGSL(node, ctx, ">=");
    case "equal": return binaryWGSL(node, ctx, "==");
    case "notEqual": return binaryWGSL(node, ctx, "!=");

    case "and": return binaryWGSL(node, ctx, "&&");
    case "or": return binaryWGSL(node, ctx, "||");
    case "bitAnd": return binaryWGSL(node, ctx, "&");
    case "bitOr": return binaryWGSL(node, ctx, "|");
    case "bitXor": return binaryWGSL(node, ctx, "^");
    case "shiftLeft": return binaryWGSL(node, ctx, "<<");
    case "shiftRight": return binaryWGSL(node, ctx, ">>");

    case "matVecMul": {
      let mat = compileWGSLStage(node.params![0], ctx);
      let vec = compileWGSLStage(node.params![1], ctx);
      let matType = (node.params![0] as any)?._t || "mat4";
      let vecType = (node.params![1] as any)?._t || "vec3";
      if (matType === "mat4" && vecType === "vec3") {
        return {
          decls: [...mat.decls, ...vec.decls],
          body: [...mat.body, ...vec.body],
          expr: `(${mat.expr} * vec4<f32>(${vec.expr}, 1.0)).xyz`,
        };
      }
      return {
        decls: [...mat.decls, ...vec.decls],
        body: [...mat.body, ...vec.body],
        expr: `(${mat.expr} * ${vec.expr})`,
      };
    }

    case "sin": return unaryWGSL(node, ctx, "sin");
    case "cos": return unaryWGSL(node, ctx, "cos");
    case "tan": return unaryWGSL(node, ctx, "tan");
    case "asin": return unaryWGSL(node, ctx, "asin");
    case "acos": return unaryWGSL(node, ctx, "acos");
    case "atan": return unaryWGSL(node, ctx, "atan");
    case "abs": return unaryWGSL(node, ctx, "abs");
    case "sign": return unaryWGSL(node, ctx, "sign");
    case "floor": return unaryWGSL(node, ctx, "floor");
    case "ceil": return unaryWGSL(node, ctx, "ceil");
    case "fract": return unaryWGSL(node, ctx, "fract");
    case "sqrt": return unaryWGSL(node, ctx, "sqrt");
    case "inversesqrt": return unaryWGSL(node, ctx, "inverseSqrt");
    case "exp": return unaryWGSL(node, ctx, "exp");
    case "log": return unaryWGSL(node, ctx, "log");
    case "exp2": return unaryWGSL(node, ctx, "exp2");
    case "log2": return unaryWGSL(node, ctx, "log2");
    case "normalize": return unaryWGSL(node, ctx, "normalize");
    case "length": return unaryWGSL(node, ctx, "length");
    case "transpose": return unaryWGSL(node, ctx, "transpose");
    case "inverse": return unaryWGSL(node, ctx, "inverse");

    case "texture":
    case "textureLod": {
      let samplerNode = node.params![0];
      let samplerCompiled = compileWGSLStage(samplerNode, ctx);
      let coords = compileWGSLStage(node.params![1], ctx);
      let samplerSlot = (samplerNode.value as any)?.slot;
      if (samplerSlot && !ctx.wgslSamplers.has(samplerSlot)) {
        ctx.wgslSamplers.set(samplerSlot, {
          textureSlot: samplerSlot,
          samplerSlot: samplerSlot + "_s",
        });
      }
      let samplerName = samplerSlot ? samplerSlot + "_s" : "sampler";
      if (node.type === "texture") {
        return {
          decls: [...samplerCompiled.decls, ...coords.decls],
          body: [...samplerCompiled.body, ...coords.body],
          expr: `textureSample(${samplerCompiled.expr}, ${samplerName}, ${coords.expr})`,
        };
      } else {
        let lod = compileWGSLStage(node.params![2], ctx);
        return {
          decls: [...samplerCompiled.decls, ...coords.decls, ...lod.decls],
          body: [...samplerCompiled.body, ...coords.body, ...lod.body],
          expr: `textureSampleLevel(${samplerCompiled.expr}, ${samplerName}, ${coords.expr}, ${lod.expr})`,
        };
      }
    }

    case "let": {
      let lhs = compileWGSLStage(node.params![0], ctx);
      let rhs = compileWGSLStage(node.params![1], ctx);
      let vt = (node.params![0] as any)._t || "float";
      let t = wgslType(vt);
      return {
        decls: [...lhs.decls, ...rhs.decls],
        body: [...lhs.body, ...rhs.body, `let ${lhs.expr}: ${t} = ${rhs.expr};`],
        expr: lhs.expr,
      };
    }

    case "assign": {
      let lhs = compileWGSLStage(node.params![0], ctx);
      let rhs = compileWGSLStage(node.params![1], ctx);
      return {
        decls: [...lhs.decls, ...rhs.decls],
        body: [...lhs.body, ...rhs.body, `${lhs.expr} = ${rhs.expr};`],
        expr: lhs.expr,
      };
    }

    case "seq": {
      let params = node.params ?? [];
      let allDecls: string[] = [];
      let allBody: string[] = [];
      let expr = "0.0";
      for (let p of params) {
        let r = compileWGSLStage(p, ctx);
        allDecls.push(...r.decls);
        allBody.push(...r.body);
        expr = r.expr;
      }
      return { decls: allDecls, body: allBody, expr };
    }

    case "if": {
      let cd = compileWGSLStage(node.params![0], ctx);
      let body = compileWGSLStage(node.params![1], ctx);
      let elseBody = node.params!.length >= 3 && node.params![2] !== undefined
        ? compileWGSLStage(node.params![2], ctx)
        : { decls: [] as string[], body: [] as string[], expr: "" };
      let lines: string[] = [
        ...cd.body,
        `if (${cd.expr}) {`,
        ...body.body.map(l => "  " + l),
        "}",
      ];
      if (elseBody.body.length > 0) {
        lines.push("else {");
        lines.push(...elseBody.body.map(l => "  " + l));
        lines.push("}");
      }
      return {
        decls: [...cd.decls, ...body.decls, ...elseBody.decls],
        body: lines,
        expr: "0.0",
      };
    }

    case "for": {
      let init = compileWGSLStage(node.params![0], ctx);
      let cd = compileWGSLStage(node.params![1], ctx);
      let update = compileWGSLStage(node.params![2], ctx);
      let body = compileWGSLStage(node.params![3], ctx);
      let initExpr = init.expr;
      let initBody = init.body;
      if (init.body.length > 0) {
        let lastStmt = init.body[init.body.length - 1];
        if (lastStmt.endsWith(';')) {
          let converted = lastStmt.slice(0, -1);
          // WGSL for-init needs var not let (skip let prefix)
          initExpr = converted;
          initBody = init.body.slice(0, -1);
        }
      }
      return {
        decls: [...init.decls, ...cd.decls, ...update.decls, ...body.decls],
        body: [
          ...initBody,
          `for (${initExpr}; ${cd.expr}; ${update.expr}) {`,
          ...body.body.map(l => "  " + l),
          "}",
        ],
        expr: "0.0",
      };
    }

    case "while": {
      let cd = compileWGSLStage(node.params![0], ctx);
      let body = compileWGSLStage(node.params![1], ctx);
      return {
        decls: [...cd.decls, ...body.decls],
        body: [
          ...cd.body,
          `while (${cd.expr}) {`,
          ...body.body.map(l => "  " + l),
          "}",
        ],
        expr: "0.0",
      };
    }

    case "discard": {
      return { decls: [], body: ["discard;"], expr: "0.0" };
    }

    case "break": {
      return { decls: [], body: ["break;"], expr: "0.0" };
    }

    case "continue": {
      return { decls: [], body: ["continue;"], expr: "0.0" };
    }

    default:
      console.warn(`[RMSL] Unsupported node type in WGSL compiler: "${node.type}"`);
      return { decls: [], body: [], expr: "0.0" };
  }
}

function binaryWGSL(
  node: BaseNode<ShaderType>,
  ctx: CompileCtx,
  op: string,
  isFn?: boolean,
): { decls: string[]; body: string[]; expr: string } {
  let lhs = compileWGSLStage(node.params![0], ctx);
  let rhs = compileWGSLStage(node.params![1], ctx);
  let lhsType = (node.params![0] as any)?._t || "float";
  let rhsType = (node.params![1] as any)?._t || "float";
  let rhsExpr = rhs.expr;
  let lhsExpr = lhs.expr;
  if (lhsType !== rhsType) {
    if (lhsType === "float" && (rhsType === "int" || rhsType === "uint")) {
      rhsExpr = `f32(${rhs.expr})`;
    } else if ((lhsType === "int" || lhsType === "uint") && rhsType === "float") {
      rhsExpr = `i32(${rhs.expr})`;
    }
  }
  let expr = isFn
    ? `${op}(${lhsExpr}, ${rhsExpr})`
    : `(${lhsExpr} ${op} ${rhsExpr})`;
  return {
    decls: [...lhs.decls, ...rhs.decls],
    body: [...lhs.body, ...rhs.body],
    expr,
  };
}

function unaryWGSL(
  node: BaseNode<ShaderType>,
  ctx: CompileCtx,
  fn: string,
): { decls: string[]; body: string[]; expr: string } {
  let a = compileWGSLStage(node.params![0], ctx);
  return {
    decls: a.decls,
    body: a.body,
    expr: `${fn}(${a.expr})`,
  };
}

function compileWGSLWithStage(
  root: Node<ShaderType> | Node<ShaderType>[],
  shaderStage: "vertex" | "fragment",
): string {
  let ctx: CompileCtx = {
    nextId: 0,
    shaderStage,
    uniforms: new Map(),
    attributes: new Map(),
    varyings: new Map(),
    outputs: new Map(),
    wgslSamplers: new Map(),
    varDefs: new Set(),
    inFn: false,
  };

  let nodes = Array.isArray(root) ? root : [root];
  let results = nodes.map(n => compileWGSLStage(n, ctx));
  let allBody: string[] = [];
  let lastExpr = "0.0";
  for (let r of results) {
    allBody.push(...r.decls, ...r.body);
    lastExpr = r.expr;
  }

  let lines: string[] = [];
  let ubBinding = 0;
  let texBinding = 0;
  let samplerBinding = 0;
  ctx.uniforms.forEach((info) => {
    if (info.type === "texture_2d<f32>" || info.type === "texture_cube<f32>") {
      lines.push(`@group(1) @binding(${texBinding++}) var ${info.slot}: ${info.type};`);
    } else {
      lines.push(`@group(0) @binding(${ubBinding++}) var<uniform> ${info.slot}: ${info.type};`);
    }
  });
  ctx.wgslSamplers.forEach((info) => {
    lines.push(`@group(2) @binding(${samplerBinding++}) var ${info.samplerSlot}: sampler;`);
  });
  if (ctx.uniforms.size > 0 || ctx.wgslSamplers.size > 0 || ctx.outputs.size > 0) {
    lines.push("");
  }

  if (shaderStage === "vertex") {
    if (ctx.attributes.size > 0) {
      lines.push("struct VertexInput {");
      let attrLoc = 0;
      ctx.attributes.forEach((info) => {
        lines.push(`  @location(${attrLoc++}) ${info.slot}: ${info.type},`);
      });
      lines.push("};");
      lines.push("");
    }
    lines.push("struct VertexOutput {");
    lines.push("  @builtin(position) position: vec4<f32>,");
    let varyingLoc = 0;
    ctx.varyings.forEach((info) => {
      lines.push(`  @location(${varyingLoc++}) ${info.slot}: ${info.type},`);
    });
    ctx.outputs.forEach((info) => {
      lines.push(`  @location(${info.location}) ${info.slot}: ${info.type},`);
    });
    lines.push("};");
    lines.push("");
    lines.push("@vertex");
    if (ctx.attributes.size > 0) {
      lines.push("fn main(input: VertexInput) -> VertexOutput {");
    } else {
      lines.push("fn main() -> VertexOutput {");
    }
    for (let line of allBody) {
      lines.push("  " + line);
    }
    if (lastExpr !== "0.0") {
      lines.push(`  return VertexOutput(${lastExpr});`);
    } else {
      lines.push("  return VertexOutput();");
    }
    lines.push("}");
  } else {
    lines.push("struct FragmentOutput {");
    ctx.outputs.forEach((info) => {
      lines.push(`  @location(${info.location}) ${info.slot}: ${info.type},`);
    });
    if (ctx.outputs.size === 0) {
      lines.push("  @location(0) _rmsl_fragColor: vec4<f32>,");
    }
    lines.push("};");
    lines.push("");
    lines.push("@fragment");
    lines.push("fn main() -> FragmentOutput {");
    for (let line of allBody) {
      lines.push("  " + line);
    }
    if (lastExpr !== "0.0") {
      lines.push(`  return FragmentOutput(${lastExpr});`);
    } else {
      lines.push("  return FragmentOutput();");
    }
    lines.push("}");
  }
  return lines.join("\n");
}

export const compileWGSL: {
  (root: Node<ShaderType> | Node<ShaderType>[]): string;
  vertex(root: Node<ShaderType> | Node<ShaderType>[]): string;
  fragment(root: Node<ShaderType> | Node<ShaderType>[]): string;
} = Object.assign(
  (root: Node<ShaderType> | Node<ShaderType>[]) => compileWGSLWithStage(root, "fragment"),
  {
    vertex: (root: Node<ShaderType> | Node<ShaderType>[]) => compileWGSLWithStage(root, "vertex"),
    fragment: (root: Node<ShaderType> | Node<ShaderType>[]) => compileWGSLWithStage(root, "fragment"),
  },
);
