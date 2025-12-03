import { Constants } from "../config/Constants.js";
export function createFrameLoop({
  device,
  context,
  pipeline,
  bindGroups,
  buffers,
  depth,
  ubos,
  uboSize,
  camera,
  ui,
  physics,
}) {
  const lightPos = [4, 8, 0, 1];

  const sphereBuffers = buffers.sphereBuffers;
  const boardBuffers = buffers.boardBuffers;

  // helper that fills a Float32Array with uniforms for a given model matrix
  function makeUniformData(MVP, modelMat, eye, lightPos) {
    const kdScale = 1.8;
    const ksScale = 50;
    const shininess = 1008;
    const Le = 10;
    const La = 0.3;

    const data = new Float32Array(uboSize / 4);
    let o = 0;

    // mvp
    data.set(flatten(MVP), o);
    o += 16;
    // model
    data.set(flatten(modelMat), o);
    o += 16;
    // eye
    data.set(eye, o);
    o += 4;
    // light
    data.set(lightPos, o);
    o += 4;
    // kd_u
    data.set([1, 1, 1, 0], o);
    o += 4;
    // ks
    data.set([1, 1, 1, 0], o);
    o += 4;
    // scales
    data.set([kdScale, ksScale, shininess, Le], o);
    o += 4;
    // ambient
    data.set([La, La, La, 0], o);
    o += 4;

    return data;
  }

  return function start() {
    function frame() {
      // ---- Physics ----
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
      const yawDeg = (yaw * 180) / Math.PI;
      const pitchDeg = (pitch * 180) / Math.PI;

      const R = mult(rotateX(pitchDeg), rotateY(yawDeg));
      const eye4 = mult(R, baseEye);
      const eye = [eye4[0], eye4[1], eye4[2], 0.0];

      const view = lookAt(
        vec3(eye[0], eye[1], eye[2]),
        vec3(0, 0, 0),
        vec3(0, 1, 0)
      );
      const MVP = mult(proj, view);

      const boardModel = mat4(); // identity for now (you can tilt later)
      const sphereModel = translate(bx, by, bz); // physics-driven ball

      // Build uniform data for each object
      const boardData = makeUniformData(MVP, boardModel, eye, lightPos);
      const sphereData = makeUniformData(MVP, sphereModel, eye, lightPos);

      // Upload both UBOs BEFORE submitting commands
      device.queue.writeBuffer(ubos.boardUbo, 0, boardData.buffer);
      device.queue.writeBuffer(ubos.sphereUbo, 0, sphereData.buffer);

      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            loadOp: "clear",
            storeOp: "store",
            clearValue: Constants.ClearColor,
          },
        ],
        depthStencilAttachment: {
          view: depth.view,
          depthClearValue: 1.0,
          depthLoadOp: "clear",
          depthStoreOp: "store",
        },
      });

      pass.setPipeline(pipeline);

      // ---- Draw BOARD ----
      pass.setBindGroup(0, bindGroups.boardBindGroup);
      pass.setVertexBuffer(0, boardBuffers.vbuf);
      pass.setVertexBuffer(1, boardBuffers.nbuf);
      pass.setVertexBuffer(2, boardBuffers.uvbuf);
      pass.setIndexBuffer(boardBuffers.ibuf, "uint32");
      pass.drawIndexed(boardBuffers.indexCount);

      // ---- Draw SPHERE ----
      pass.setBindGroup(0, bindGroups.sphereBindGroup);
      pass.setVertexBuffer(0, sphereBuffers.vbuf);
      pass.setVertexBuffer(1, sphereBuffers.nbuf);
      pass.setVertexBuffer(2, sphereBuffers.uvbuf);
      pass.setIndexBuffer(sphereBuffers.ibuf, "uint32");
      pass.drawIndexed(sphereBuffers.indexCount);

      pass.end();
      device.queue.submit([encoder.finish()]);

      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  };
}
