export function createPipeline(device, canvasFormat, code) {
  const module = device.createShaderModule({ code });

  return device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module,
      entryPoint: "main_vs",
      buffers: [
        { arrayStride: 4 * 4, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x4" }] },
        { arrayStride: 4 * 4, attributes: [{ shaderLocation: 1, offset: 0, format: "float32x4" }] },
        { arrayStride: 4 * 4, attributes: [{ shaderLocation: 2, offset: 0, format: "float32x4" }] },
      ],
    },
    fragment: {
      module,
      entryPoint: "main_fs",
      targets: [{ format: canvasFormat }],
    },
    primitive: { topology: "triangle-list", cullMode: "back", frontFace: "ccw" },
    depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
  });
}
