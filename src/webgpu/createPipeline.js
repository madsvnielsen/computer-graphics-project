export function createPipeline(device, canvasFormat, code) {
  const module = device.createShaderModule({ code });

  // 🔹 Define the shared bind group layout explicitly (fixes the warning)
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {} },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout],
  });

  const vertexState = {
    module,
    entryPoint: "main_vs",
    buffers: [
      { arrayStride: 4 * 4, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x4" }] },
      { arrayStride: 4 * 4, attributes: [{ shaderLocation: 1, offset: 0, format: "float32x4" }] },
      { arrayStride: 4 * 2, attributes: [{ shaderLocation: 2, offset: 0, format: "float32x2" }] },
    ],
  };

  // ---- Normal Pipeline ----
  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,   // 🔹 use explicit layout
    vertex: vertexState,
    fragment: {
      module,
      entryPoint: "main_fs",
      targets: [{ format: canvasFormat }],
    },
    primitive: {
      topology: "triangle-list",
      cullMode: "back",
      frontFace: "ccw",
    },
    depthStencil: {
      format: "depth24plus",
      depthWriteEnabled: true,
      depthCompare: "less",
    },
  });

  // Shadow vertex buffer layout: no UVs needed
const shadowVertexState = {
  module,
  entryPoint: "shadow_vs",
  buffers: [
    { arrayStride: 4 * 4, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x4" }] },
    { arrayStride: 4 * 4, attributes: [{ shaderLocation: 1, offset: 0, format: "float32x4" }] },
  ],
};

const shadowPipeline = device.createRenderPipeline({
  layout: pipelineLayout,
  vertex: shadowVertexState,
  fragment: {
    module,
    entryPoint: "shadow_fs",
    targets: [
      {
        format: canvasFormat,
        blend: {
          color: {
            srcFactor: "src-alpha",
            dstFactor: "one-minus-src-alpha",
            operation: "add",
          },
          alpha: {
            srcFactor: "one",
            dstFactor: "one-minus-src-alpha",
            operation: "add",
          },
        },
        writeMask: GPUColorWrite.ALL,
      },
    ],
  },
  primitive: {
    topology: "triangle-list",
    cullMode: "back",
    frontFace: "ccw",
  },
  depthStencil: {
    format: "depth24plus",
    depthWriteEnabled: true,
    depthCompare: "less-equal", // Only draw on visible ground
  },
});

  // Return layout too so runMarbleMaze can build bindGroup correctly
  return { pipeline, shadowPipeline, bindGroupLayout };
}
