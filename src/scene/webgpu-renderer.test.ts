// Texture bookkeeping in the WebGPU renderer, against a recording stub of a
// GPUDevice.
//
// Chromium-with-SwiftShader — what the other renderer tests draw through — has
// no WebGPU, so this layer has nowhere to run for real here. What the stub does
// cover is the part that is bookkeeping rather than drawing: which GPU textures
// are created, written and destroyed as a `Texture` is updated or disposed, and
// which bind groups have to be built again because the texture they named is
// gone.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { vec2 } from "../rmsl";
import { WebGPURenderer, Scene, MeshBasicMaterial, DataTexture } from "./index";

/** A GPUTexture stand-in: its size and format, and whether it was destroyed. */
interface StubTexture {
  width: number;
  height: number;
  depthOrArrayLayers: number;
  format: string;
  destroyed: boolean;
  createView: () => { texture: StubTexture };
  destroy: () => void;
}

interface StubDevice {
  device: any;
  textures: StubTexture[];
  bindGroups: unknown[];
  /** One entry per `queue.writeTexture`: which texture, and the bytes given. */
  writes: { texture: StubTexture; data: ArrayBufferView }[];
}

function stubDevice(): StubDevice {
  const textures: StubTexture[] = [];
  const bindGroups: unknown[] = [];
  const writes: { texture: StubTexture; data: ArrayBufferView }[] = [];
  const device = {
    createShaderModule: () => ({}),
    createBuffer: () => ({ destroy: () => {} }),
    createBindGroupLayout: () => ({}),
    createPipelineLayout: () => ({}),
    createRenderPipeline: () => ({}),
    createSampler: () => ({}),
    createBindGroup: (descriptor: unknown) => {
      const group = { descriptor };
      bindGroups.push(group);
      return group;
    },
    createTexture: (descriptor: any) => {
      const [width, height, depth] = descriptor.size;
      const texture: StubTexture = {
        width,
        height,
        depthOrArrayLayers: depth,
        format: descriptor.format,
        destroyed: false,
        createView: () => ({ texture }),
        destroy: () => { texture.destroyed = true; },
      };
      textures.push(texture);
      return texture;
    },
    queue: {
      writeTexture: (destination: any, data: ArrayBufferView) => {
        writes.push({ texture: destination.texture, data });
      },
      writeBuffer: () => {},
    },
  };
  return { device, textures, bindGroups, writes };
}

function stubCanvas(): any {
  return {
    width: 16,
    height: 16,
    getContext: () => ({ configure: () => {} }),
  };
}

/** A material whose only fragment work is sampling `texture`. */
function texturedMaterial(texture: DataTexture): MeshBasicMaterial {
  const material = new MeshBasicMaterial();
  material.fragmentNode = (b) => b.sampler("map", () => texture).texture(vec2(0.5, 0.5));
  return material;
}

beforeEach(() => {
  vi.stubGlobal("navigator", { gpu: { getPreferredCanvasFormat: () => "bgra8unorm" } });
  vi.stubGlobal("GPUBufferUsage", { UNIFORM: 1, COPY_DST: 2, VERTEX: 4, INDEX: 8 });
  vi.stubGlobal("GPUTextureUsage", { TEXTURE_BINDING: 1, COPY_DST: 2, RENDER_ATTACHMENT: 4 });
  vi.stubGlobal("GPUShaderStage", { VERTEX: 1, FRAGMENT: 2 });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WebGPURenderer texture updates", () => {
  it("uploads a changed image again on the next render", () => {
    const { device, textures, bindGroups, writes } = stubDevice();
    const renderer = new WebGPURenderer(stubCanvas(), device) as any;
    const texture = new DataTexture(new Uint8Array([0, 0, 220, 255]), 1, 1);
    const material = texturedMaterial(texture);
    const scene = new Scene();

    const entry = renderer.ensurePipeline(material, scene, false, false);
    expect(writes).toHaveLength(1);
    expect(texture.needsUpdate).toBe(false);

    texture.image = new Uint8Array([220, 0, 0, 255]);
    texture.needsUpdate = true;
    renderer.ensurePipeline(material, scene, false, false);

    expect(writes).toHaveLength(2);
    expect([...(writes[1].data as Uint8Array)]).toEqual([220, 0, 0, 255]);
    // The image is written into the texture that is already bound, so nothing
    // was created and the bind group still holds.
    expect(writes[1].texture).toBe(textures[0]);
    expect(textures).toHaveLength(1);
    expect(bindGroups).toHaveLength(1);
    expect(entry.bindGroup).toBe(bindGroups[0]);
  });

  it("leaves an unchanged texture alone", () => {
    const { device, writes } = stubDevice();
    const renderer = new WebGPURenderer(stubCanvas(), device) as any;
    const texture = new DataTexture(new Uint8Array([0, 0, 220, 255]), 1, 1);
    const material = texturedMaterial(texture);
    const scene = new Scene();

    renderer.ensurePipeline(material, scene, false, false);
    renderer.ensurePipeline(material, scene, false, false);
    expect(writes).toHaveLength(1);
  });

  it("replaces and rebinds a texture whose image changed size", () => {
    const { device, textures, bindGroups, writes } = stubDevice();
    const renderer = new WebGPURenderer(stubCanvas(), device) as any;
    const texture = new DataTexture(new Uint8Array([0, 0, 220, 255]), 1, 1);
    const material = texturedMaterial(texture);
    const scene = new Scene();

    const entry = renderer.ensurePipeline(material, scene, false, false);
    const first = entry.bindGroup;

    texture.image = new Uint8Array(2 * 2 * 4).fill(220);
    texture.width = 2;
    texture.height = 2;
    texture.needsUpdate = true;
    const again = renderer.ensurePipeline(material, scene, false, false);

    // A GPU texture is fixed at the size it was created with, so the bigger
    // image needs a new one — and a bind group naming the old one is no good.
    expect(textures).toHaveLength(2);
    expect(textures[0].destroyed).toBe(true);
    expect(textures[1].width).toBe(2);
    expect(writes[1].texture).toBe(textures[1]);
    expect(renderer.textures.get(texture)).toBe(textures[1]);
    expect(again.bindGroup).not.toBe(first);
    expect(bindGroups).toHaveLength(2);
  });
});

describe("WebGPURenderer texture disposal", () => {
  it("destroys the GPU texture and rebuilds the bind groups that named it", () => {
    const { device, textures, bindGroups } = stubDevice();
    const renderer = new WebGPURenderer(stubCanvas(), device) as any;
    const texture = new DataTexture(new Uint8Array([0, 0, 220, 255]), 1, 1);
    const material = texturedMaterial(texture);
    const scene = new Scene();

    const entry = renderer.ensurePipeline(material, scene, false, false);
    expect(textures).toHaveLength(1);
    expect(bindGroups).toHaveLength(1);
    const first = entry.bindGroup;

    texture.dispose();
    expect(textures[0].destroyed).toBe(true);
    expect(renderer.textures.size).toBe(0);
    expect(renderer.samplers.size).toBe(0);
    // The group still holding a view of the destroyed texture is gone, so no
    // draw can reach it.
    expect(entry.bindGroup).toBe(null);

    // Looking the pipeline up again re-uploads the texture and binds it anew,
    // without recompiling the shaders.
    const again = renderer.ensurePipeline(material, scene, false, false);
    expect(again).toBe(entry);
    expect(textures).toHaveLength(2);
    expect(bindGroups).toHaveLength(2);
    expect(again.bindGroup).not.toBe(first);
    expect(renderer.textures.get(texture)).toBe(textures[1]);
  });

  it("leaves pipelines that do not sample the disposed texture alone", () => {
    const { device } = stubDevice();
    const renderer = new WebGPURenderer(stubCanvas(), device) as any;
    const used = new DataTexture(new Uint8Array([0, 0, 220, 255]), 1, 1);
    const unused = new DataTexture(new Uint8Array([220, 0, 0, 255]), 1, 1);
    const scene = new Scene();
    const entry = renderer.ensurePipeline(texturedMaterial(used), scene, false, false);
    const bindGroup = entry.bindGroup;

    unused.dispose();
    expect(entry.bindGroup).toBe(bindGroup);
  });

  it("stops listening to the textures it frees when the renderer is disposed", () => {
    const { device, textures } = stubDevice();
    const renderer = new WebGPURenderer(stubCanvas(), device) as any;
    const texture = new DataTexture(new Uint8Array([0, 0, 220, 255]), 1, 1);
    renderer.ensurePipeline(texturedMaterial(texture), new Scene(), false, false);

    renderer.dispose();
    expect(textures[0].destroyed).toBe(true);
    expect(texture.hasEventListener("dispose", renderer.onTextureDispose)).toBe(false);
  });
});
