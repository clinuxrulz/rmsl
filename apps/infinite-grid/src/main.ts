import { compileGLSL, float, Fn, If, uniform, varying, Node, vec3, vec4, compileWGSL } from "rmsl";

let cameraProjectionMatrix = uniform("mat4");
let cameraViewMatrix = uniform("mat4");
let cameraProjectionMatrixInverse = uniform("mat4");
let cameraWorldMatrix = uniform("mat4");
let cameraPosition = uniform("vec3");
let positionWorld = varying("vec3");
let positionGeometry = varying("vec3");

let getGrid = Fn((size: Node<"float">, p: Node<"vec3">) => {
  let r = p.xz.div(size).toVar();
  let grid = r.sub(0.5).fract().sub(0.5).abs().div(r.fwidth());
  let line = grid.x.min(grid.y);
  return float(1.0).sub(line.mult(0.5).min(1.0));
});

let calcColourAndDepth = Fn(() => {
  let isOrthographic = cameraProjectionMatrix.element(2).y.equal(0.0).toVar();

  let skyColour = vec3(0.3, 0.4, 0.6);
  let horizSkyColour = vec3(0.5, 0.5, 0.6);

  let ro = vec3().toVar();
  let rd = vec3().toVar();

  If(isOrthographic, () => {
      rd.assign(vec3(
        cameraViewMatrix.element(0).z,
        cameraViewMatrix.element(1).z,
        cameraViewMatrix.element(2).z
      ).negate().normalize());
      ro.assign(positionWorld);
  }).Else(() => {
      ro.assign(cameraPosition);
      let viewPos = cameraProjectionMatrixInverse.mult(vec4(positionGeometry.x, positionGeometry.y, -1.0, 1.0));
      let worldDir = cameraWorldMatrix.mult(vec4(viewPos.x, viewPos.y, viewPos.z, 0.0));
      rd.assign(worldDir.xyz.normalize());
  });

  let colour = vec3(0.7, 0.7, 0.7).toVar();
  let fragDepth = float(1.0).toVar();

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

  return vec4(colour, fragDepth);
});

let result = calcColourAndDepth();

console.log("GLSL Code:");
console.log(compileGLSL(result));
console.log("");
console.log("WGSL Code:");
console.log(compileWGSL(result));
