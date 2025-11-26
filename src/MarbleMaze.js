import { initWebGPU } from "./webgpu/initWebGPU.js";
import { createPipeline } from "./webgpu/createPipeline.js";
import { loadModelBuffers } from "./scene/loadModelBuffers.js";
import { createCameraController } from "./scene/cameraController.js";
import { createFrameLoop } from "./scene/frameLoop.js";

export async function runMarbleMaze({ canvas, ui }) {
  if (!navigator.gpu) {
    alert("WebGPU not available");
    return;
  }

  const { device, context, canvasFormat } = await initWebGPU(canvas);

  const wgslScript = document.getElementById("wgsl");
  const code = wgslScript
    ? await fetch(wgslScript.src, { cache: "reload" }).then(r => r.text())
    : `/* inline WGSL */`;

  const pipeline = createPipeline(device, canvasFormat, code);

  const depth = { texture: null, view: null, width: 0, height: 0 };

  function ensureDepth() {
    const w = canvas.width;
    const h = canvas.height;
    if (!depth.texture || depth.width !== w || depth.height !== h) {
      depth.texture?.destroy?.();
      depth.texture = device.createTexture({
        size: [w, h],
        format: "depth24plus",
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      depth.view = depth.texture.createView();
      depth.width = w;
      depth.height = h;
    }
  }
  ensureDepth();

  const { vbuf, nbuf, cbuf, ibuf, indexCount } =
    await loadModelBuffers(device, "../models/Ocean.obj");

  const uboSize = 16 * 4 + 4 * 4 * 6;
  const ubo = device.createBuffer({
    size: uboSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: ubo } }],
  });

  const camera = createCameraController(canvas);

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

  const startFrameLoop = createFrameLoop({
    device,
    context,
    pipeline,
    bindGroup,
    buffers: { vbuf, nbuf, cbuf, ibuf, indexCount },
    depth,
    ubo,
    camera,
    ui,
  });

  startFrameLoop();
}
