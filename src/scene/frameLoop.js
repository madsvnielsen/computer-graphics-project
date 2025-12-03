import { Constants } from "../config/Constants.js";

// helper: quaternion -> mat4 (column-major, MV.js-style mat4)
function quatToMat4(x, y, z, w) {
  const xx = x * x, yy = y * y, zz = z * z;
  const xy = x * y, xz = x * z, yz = y * z;
  const wx = w * x, wy = w * y, wz = w * z;

  // column-major: mat4( col0, col1, col2, col3 )
  return mat4(
    vec4(1 - 2 * (yy + zz),     2 * (xy + wz),         2 * (xz - wy),         0),
    vec4(2 * (xy - wz),         1 - 2 * (xx + zz),     2 * (yz + wx),         0),
    vec4(2 * (xz + wy),         2 * (yz - wx),         1 - 2 * (xx + yy),     0),
    vec4(0,                     0,                     0,                     1)
  );
}

export function createFrameLoop({
  device,
  context,
  pipeline,
  bindGroups,
  buffers,
  depth,
  ubos,
  uboSize,
  ui,
  physics,
}) {
  const lightPos = [0, 25, 8, 0];

  const sphereBuffers = buffers.sphereBuffers;
  const boardBuffers  = buffers.boardBuffers;

  const boardBindGroup  = bindGroups.boardBindGroup  ?? bindGroups.board;
  const sphereBindGroup = bindGroups.sphereBindGroup ?? bindGroups.sphere;

  const boardUbo  = ubos.boardUbo  ?? ubos.board;
  const sphereUbo = ubos.sphereUbo ?? ubos.sphere;

  function makeUniformData(MVP, modelMat, eye, lightPos) {
    const kdScale   = 5.8;
    const ksScale   = 1.0;
    const shininess = 50;
    const Le        = 50;
    const La        = 0.1;

    const data = new Float32Array(uboSize / 4);
    let o = 0;

    data.set(flatten(MVP), o); o += 16;              // mvp
    data.set(flatten(modelMat), o); o += 16;         // model
    data.set(eye, o); o += 4;                        // eye
    data.set(lightPos, o); o += 4;                   // light
    data.set([1, 1, 1, 0], o); o += 4;               // kd_u
    data.set([1, 1, 1, 0], o); o += 4;               // ks
    data.set([kdScale, ksScale, shininess, Le], o); o += 4; // scales
    data.set([La, La, La, 0], o); o += 4;            // ambient

    return data;
  }

  return function start() {
    function frame() {
      // --- PHYSICS ---
      physics.step(1 / 60);

      // full transform (pos + quat) for the ball
      const ball = physics.getBallTransform();
      const [bx, by, bz] = ball.position;
      const [qx, qy, qz, qw] = ball.rotation;

      const floor = physics.getFloorPositionAndRotation();
      const fpos  = floor.position; // [fx, fy, fz]
      const pitch = floor.pitch;    // radians (X)
      const roll  = floor.roll;     // radians (Z)

      const fx = fpos[0];
      const fy = fpos[1];
      const fz = fpos[2];

      const pitchDegTilt = pitch * 180 / Math.PI;
      const rollDegTilt  = roll  * 180 / Math.PI;

      // --- CAMERA / PROJ / VIEW ---
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

      // Fixed base camera: orbiting a bit above and to the side
      const baseRadius   = 45.0;
      const baseYawDeg   = 0.0;   // around Y
      const basePitchDeg = 45.0;   // look down

      const baseEye = vec4(0.0, 0.0, baseRadius, 1.0);

      const RcamBase = mult(
        rotateX(basePitchDeg),
        rotateY(baseYawDeg)
      );

      // Rotate camera opposite to tilt
      const RtiltCam = mult(
        rotateZ(-rollDegTilt),
        rotateX(-pitchDegTilt)
      );

      const RcamTotal = mult(RtiltCam, RcamBase);

      const eye4 = mult(RcamTotal, baseEye);
      const eye  = [eye4[0], eye4[1], eye4[2], 0.0];

      // Up vector: world up rotated by tilt
      const upWorld4 = vec4(0, 1, 0, 0);
      const up4      = mult(RtiltCam, upWorld4);
      const up       = vec3(up4[0], up4[1], up4[2]);

      const view = lookAt(
        vec3(eye[0], eye[1], eye[2]),
        vec3(0, 0, 0),
        up
      );

      const MVP = mult(proj, view);

      // --- MODEL MATRICES ---
      // Board: no rotation, just translate to floorPos
      const boardModel = translate(fx, fy, fz);

      // Ball: translate + rotation from physics quaternion
      const Rball       = quatToMat4(qx, qy, qz, qw);
      const sphereModel = mult(translate(bx, by, bz), Rball);

      // --- DRAW ---
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

      pass.setPipeline(pipeline);

      // Board
      const boardData = makeUniformData(MVP, boardModel, eye, lightPos);
      device.queue.writeBuffer(boardUbo, 0, boardData.buffer);
      pass.setBindGroup(0, boardBindGroup);
      pass.setVertexBuffer(0, boardBuffers.vbuf);
      pass.setVertexBuffer(1, boardBuffers.nbuf);
      pass.setVertexBuffer(2, boardBuffers.uvbuf);
      pass.setIndexBuffer(boardBuffers.ibuf, "uint32");
      pass.drawIndexed(boardBuffers.indexCount);

      // Sphere
      const sphereData = makeUniformData(MVP, sphereModel, eye, lightPos);
      device.queue.writeBuffer(sphereUbo, 0, sphereData.buffer);
      pass.setBindGroup(0, sphereBindGroup);
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
