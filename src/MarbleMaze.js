import { initWebGPU } from "./webgpu/initWebGPU.js";
import { createPipeline } from "./webgpu/createPipeline.js";
import { loadModelBuffers } from "./scene/loadModelBuffers.js";
import { createFrameLoop } from "./scene/frameLoop.js";
import { initPhysics } from "./physics/initPhysics.js";
import { setupKeyboardInput } from "./input/keyboardInput.js";
import { loadTexture } from "./webgpu/textureLoader.js";

export async function runMarbleMaze({ canvas, ui }) {
  if (!navigator.gpu) {
    alert("WebGPU not available");
    return;
  }

  const { device, context, canvasFormat } = await initWebGPU(canvas);

  const wgslScript = document.getElementById("wgsl");
  const code = wgslScript
    ? await fetch(wgslScript.src, { cache: "reload" }).then((r) => r.text())
    : `/* inline WGSL */`;

  const { pipeline, shadowPipeline, bindGroupLayout } = createPipeline(
    device,
    canvasFormat,
    code
  );

  const depth = createDepthBuffer(device, canvas);

  const sphereBuffers = await loadModelBuffers(device, "../models/sphere.obj");
  const boardBuffers = await loadModelBuffers(device, "../models/board.obj");

  const uboSize = 16 * 4 * 2 + 4 * 4 * 6;

  const boardUbo = device.createBuffer({
    size: uboSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const sphereUbo = device.createBuffer({
    size: uboSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const shadowUbo = device.createBuffer({
    size: uboSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const texColor = await loadTexture(
    device,
    "../textures/oak_veneer_01_diff_4k.jpg"
  );

  const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
    mipmapFilter: "linear",
    addressModeU: "repeat",
    addressModeV: "repeat",
  });

  const boardBindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: boardUbo } },
      { binding: 1, resource: texColor },
      { binding: 2, resource: sampler },
    ],
  });

  const sphereBindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: sphereUbo } },
      { binding: 1, resource: texColor },
      { binding: 2, resource: sampler },
    ],
  });

  const shadowBindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: shadowUbo } },
      { binding: 1, resource: texColor },
      { binding: 2, resource: sampler },
    ],
  });

  setupResize(canvas, depth.ensureDepth);

  const AmmoLib = await Ammo();
  const physics = initPhysics(AmmoLib, boardBuffers);

  setupKeyboardInput(physics);

  const startFrameLoop = createFrameLoop({
    device,
    context,
    pipeline,
    bindGroups: { boardBindGroup, sphereBindGroup },
    buffers: { sphereBuffers, boardBuffers },
    shadowPipeline,
    shadowBindGroup,
    depth,
    ubos: { boardUbo, sphereUbo, shadowUbo },
    uboSize,
    ui,
    physics,
  });

  startFrameLoop();
}

function createDepthBuffer(device, canvas) {
  const depth = { texture: null, view: null, width: 0, height: 0 };

  function ensureDepth() {
    const w = canvas.width;
    const h = canvas.height;
    if (!depth.texture || depth.width !== w || depth.height !== h) {
      depth.texture?.destroy?.();
      depth.texture = device.createTexture({
        size: [w, h],
        format: "depth24plus-stencil8",
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      depth.view = depth.texture.createView();
      depth.width = w;
      depth.height = h;
    }
  }

  ensureDepth();
  depth.ensureDepth = ensureDepth;

  return depth;
}

function setupResize(canvas, ensureDepth) {
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      ensureDepth();
    }
  }

  window.addEventListener("resize", resize);
  resize();
}
