import { Constants } from "../config/Constants.js";

export function createFrameLoop({
  device,
  context,
  pipeline,
  shadowPipeline,
  bindGroup,
  shadowBindGroup,
  buffers,
  depth,
  ubo,
  shadowUbo,
  camera,
  ui,
  physics,
}) {
  const lightPos = [4, 8, 0, 1];
  // mvp + model + 6 vec4
  const uboSize = ubo.size ?? (16 * 4 * 2 + 4 * 4 * 6);

  const sphereBuffers = buffers.sphereBuffers;
  const boardBuffers = buffers.boardBuffers;

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

      const view = lookAt(
        vec3(eye[0], eye[1], eye[2]),
        vec3(0, 0, 0),
        vec3(0, 1, 0)
      );
      const MVP = mult(proj, view);

      // model matrix from physics position (simple translation)
      const model = translate(bx, by, bz);

      // UI / material params
      const kdScale = 1.8;
      const ksScale = 50;
      const shininess = 1008;
      const Le = 10;
      const La = 0.3;

      // 🔹 ORIGINAL UBO PACKING – unchanged
      const data = new Float32Array(uboSize / 4);
      let o = 0;
      // mvp
      data.set(flatten(MVP), o); o += 16;
      // model
      data.set(flatten(model), o); o += 16;
      // eye, light, materials etc.
      data.set(eye, o); o += 4;
      data.set(lightPos, o); o += 4;
      data.set([1, 1, 1, 0], o); o += 4;
      data.set([1, 1, 1, 0], o); o += 4;
      data.set([kdScale, ksScale, shininess, Le], o); o += 4;
      data.set([La, La, La, 0], o); o += 4;

      // write main UBO (normal rendering)
      device.queue.writeBuffer(ubo, 0, data.buffer);

      // --- Command encoder & main pass ---
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: context.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: Constants.ClearColor,
        }],
        depthStencilAttachment: {
          view: depth.view,
          depthClearValue: 1.0,
          depthLoadOp: "clear",
          depthStoreOp: "store",
        },
      });

      // --- NORMAL GEOMETRY PASS (board + sphere) – EXACTLY your old code ---
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);

      // Board
      pass.setVertexBuffer(0, boardBuffers.vbuf);
      pass.setVertexBuffer(1, boardBuffers.nbuf);
      pass.setVertexBuffer(2, boardBuffers.uvbuf);
      pass.setIndexBuffer(boardBuffers.ibuf, "uint32");
      pass.drawIndexed(boardBuffers.indexCount);

      // Sphere
      pass.setVertexBuffer(0, sphereBuffers.vbuf);
      pass.setVertexBuffer(1, sphereBuffers.nbuf);
      pass.setVertexBuffer(2, sphereBuffers.uvbuf);
      pass.setIndexBuffer(sphereBuffers.ibuf, "uint32");
      pass.drawIndexed(sphereBuffers.indexCount);

      // --- SHADOW PASS ---
      {
        // Project onto board surface (y = 0)
        const planeNormal = [0, 1, 0];
        const planeD = 0.02; // just above board top

        const light = [lightPos[0], lightPos[1], lightPos[2]];

        const Ms = shadowMatrix(planeNormal, planeD, light);
        const shadowMVP = mult(proj, mult(view, Ms));

        // write to shadow UBO
        const shadowData = new Float32Array(uboSize / 4);
        let s = 0;
        shadowData.set(flatten(shadowMVP), s); s += 16;
        shadowData.set(flatten(model), s); s += 16;

        device.queue.writeBuffer(shadowUbo, 0, shadowData.buffer);

        pass.setPipeline(shadowPipeline);
        pass.setBindGroup(0, shadowBindGroup);

        pass.setVertexBuffer(0, sphereBuffers.vbuf);
        pass.setVertexBuffer(1, sphereBuffers.nbuf);
        pass.setIndexBuffer(sphereBuffers.ibuf, "uint32");
        pass.drawIndexed(sphereBuffers.indexCount);
      }


      pass.end();

      device.queue.submit([encoder.finish()]);
      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  };
}

function shadowMatrix(planeNormal, planeD, lightPos) {
  const [nx, ny, nz] = planeNormal;
  const [lx, ly, lz] = lightPos;

  const dot = nx * lx + ny * ly + nz * lz + planeD;
  const m = mat4();
  m[0][0] = dot - lx * nx; m[0][1] = -lx * ny; m[0][2] = -lx * nz; m[0][3] = -lx * planeD;
  m[1][0] = -ly * nx; m[1][1] = dot - ly * ny; m[1][2] = -ly * nz; m[1][3] = -ly * planeD;
  m[2][0] = -lz * nx; m[2][1] = -lz * ny; m[2][2] = dot - lz * nz; m[2][3] = -lz * planeD;
  m[3][0] = -nx; m[3][1] = -ny; m[3][2] = -nz; m[3][3] = dot - planeD;
  return m;
}
