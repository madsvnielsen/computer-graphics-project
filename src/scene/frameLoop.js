export function createFrameLoop({
  device,
  context,
  pipeline,
  bindGroup,
  buffers,
  depth,
  ubo,
  camera,
  ui,
  physics,           // NEW
}) {
  const lightPos = [4, 2, 0, 1];
  // UPDATED fallback UBO size (mvp + model + 6 vec4)
  const uboSize = ubo.size ?? (16 * 4 * 2 + 4 * 4 * 6);

  return function start() {
    function frame() {

      // --- PHYSICS STEP (fixed 60Hz) ---
      physics.step(1 / 60);
      const [bx, by, bz] = physics.getBallPosition();

      const canvas = context.canvas;
      const dpr = window.devicePixelRatio || 1;
      const aspect = (canvas.clientWidth * dpr) / (canvas.clientHeight * dpr);

      const projGL = perspective(45.0, aspect, 0.1, 100.0);
      const Z01 = mat4(
        vec4(1, 0, 0, 0),
        vec4(0, 1, 0, 0),
        vec4(0, 0, 0.5, 0.5),
        vec4(0, 0, 0, 1)
      );
      const proj = mult(Z01, projGL);

      const yaw = camera.getYaw();
      const pitch = camera.getPitch();
      const baseEye = vec4(0.0, 0.0, camera.radius, 1.0);
      const yawDeg = yaw * 180 / Math.PI;
      const pitchDeg = pitch * 180 / Math.PI;

      const R = mult(rotateX(pitchDeg), rotateY(yawDeg));
      const eye4 = mult(R, baseEye);
      const eye = [eye4[0], eye4[1], eye4[2], 0.0];

      const view = lookAt(vec3(eye[0], eye[1], eye[2]), vec3(0, 0, 0), vec3(0, 1, 0));
      const MVP = mult(proj, view);

      // NEW: model matrix from physics position (simple translation)
      const model = translate(bx, by, bz);

      // UI / material params
      const kdScale = 1.8;
      const ksScale = 50;
      const shininess = 1008;
      const Le = 10;
      const La = 0.3;

      const data = new Float32Array(uboSize / 4);
      let o = 0;
      // mvp
      data.set(flatten(MVP), o); o += 16;
      // model (NEW)
      data.set(flatten(model), o); o += 16;
      // eye, light, materials etc.
      data.set(eye, o); o += 4;
      data.set(lightPos, o); o += 4;
      data.set([1, 1, 1, 0], o); o += 4;
      data.set([1, 1, 1, 0], o); o += 4;
      data.set([kdScale, ksScale, shininess, Le], o); o += 4;
      data.set([La, La, La, 0], o); o += 4;

      device.queue.writeBuffer(ubo, 0, data.buffer);

      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: context.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0.2, g: 0.5, b: 0.8, a: 1 },
        }],
        depthStencilAttachment: {
          view: depth.view,
          depthClearValue: 1.0,
          depthLoadOp: "clear",
          depthStoreOp: "store",
        },
      });

      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.setVertexBuffer(0, buffers.vbuf);
      pass.setVertexBuffer(1, buffers.nbuf);
      pass.setVertexBuffer(2, buffers.uvbuf)
      //pass.setVertexBuffer(2, buffers.cbuf);
      pass.setIndexBuffer(buffers.ibuf, "uint32");
      pass.drawIndexed(buffers.indexCount);
      pass.end();

      device.queue.submit([encoder.finish()]);
      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  };
}
