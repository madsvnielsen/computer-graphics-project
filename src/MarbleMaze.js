import { initWebGPU } from "./webgpu/initWebGPU.js";
import { createPipeline } from "./webgpu/createPipeline.js";
import { loadModelBuffers } from "./scene/loadModelBuffers.js";
import { createFrameLoop } from "./scene/frameLoop.js";

export async function runMarbleMaze({ canvas, ui }) {
  if (!navigator.gpu) {
    alert("WebGPU not available");
    return;
  }

  // --- WebGPU init ---
  const { device, context, canvasFormat } = await initWebGPU(canvas);

  // --- Load WGSL shader code ---
  const wgslScript = document.getElementById("wgsl");
  const code = wgslScript
    ? await fetch(wgslScript.src, { cache: "reload" }).then((r) => r.text())
    : `/* inline WGSL */`;

  const { pipeline, shadowPipeline, bindGroupLayout } = createPipeline(device, canvasFormat, code);
  // --- Depth buffer ---
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

  const sphereBuffers = await loadModelBuffers(device, "../models/sphere.obj");

  const boardBuffers = await loadModelBuffers(device, "../models/board.obj");

  // NEW: include extra mat4 (model)
  const uboSize = 16 * 4 * 2 + 4 * 4 * 6;

  const boardUbo = device.createBuffer({
    size: uboSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const sphereUbo = device.createBuffer({
    size: uboSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // 🔹 NEW: separate UBO for shadow pass
  const shadowUbo = device.createBuffer({
    size: uboSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });


  // --- Load textures (Polyhaven ball) ---
  // NOTE: change file names/paths to match your actual files
  const texColor = await loadTexture(device, "../textures/brown-wood.jpg");
  //const texNormal = await loadTexture(device, "../textures/ball_nor_gl_4k.png");
  // Prefer PNG/JPG instead of EXR for the browser:
  //const texRough = await loadTexture(device, "../textures/ball_rough_4k.png");

  const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
  });

  // --- Bind group (must match WGSL bindings) ---
  const boardBindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: boardUbo } }, // U (board uniforms)
      { binding: 1, resource: texColor }, // myColorTex
      { binding: 2, resource: sampler }, // mySampler
    ],
  });

  const sphereBindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: sphereUbo } }, // U (sphere uniforms)
      { binding: 1, resource: texColor }, // myColorTex
      { binding: 2, resource: sampler }, // mySampler
    ],
  });

  // 🔹 NEW: shadow bind group (same layout, different UBO)
const shadowBindGroup = device.createBindGroup({
  layout: bindGroupLayout,
  entries: [
    { binding: 0, resource: { buffer: shadowUbo } },
    { binding: 1, resource: texColor }, // not used by shadow_fs, but required by layout
    { binding: 2, resource: sampler },
  ],
});


  // --- Resize handling ---
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

  // --- Initialize Ammo physics (global Ammo from script tag) ---
  const AmmoLib = await Ammo();
  const physics = initPhysics(AmmoLib, boardBuffers);

// track which keys are down
const keyState = {
  ArrowUp:    false,
  ArrowDown:  false,
  ArrowLeft:  false,
  ArrowRight: false,
};

// compute axes from keyState and send to physics
function updateTiltInput() {
  // forward/back: Up = +1, Down = -1
  let forward = 0;
  if (keyState.ArrowUp)   forward += 1;
  if (keyState.ArrowDown) forward -= 1;

  // left/right: Right = +1, Left = -1
  let right = 0;
  if (keyState.ArrowRight) right += 1;
  if (keyState.ArrowLeft)  right -= 1;

  // optional: normalize diagonals so speed stays consistent
  if (forward !== 0 && right !== 0) {
    const invLen = 1 / Math.sqrt(2);
    forward *= invLen;
    right   *= invLen;
  }

  physics.setTiltInput(forward, right);
}

window.addEventListener("keydown", (e) => {
  if (e.key in keyState) {
    if (!keyState[e.key]) {
      keyState[e.key] = true;
      updateTiltInput();
    }
    // prevent browser scroll on arrows
    e.preventDefault();
  }
});

window.addEventListener("keyup", (e) => {
  if (e.key in keyState) {
    keyState[e.key] = false;
    updateTiltInput();
    e.preventDefault();
  }
});

  // --- Frame loop (render + physics) ---
  const startFrameLoop = createFrameLoop({
    device,
    context,
    pipeline,
    bindGroups: { boardBindGroup, sphereBindGroup },
    buffers: { sphereBuffers, boardBuffers },
    shadowPipeline,        // ✔
    shadowBindGroup,       // ✔
    depth,
    ubos: { boardUbo, sphereUbo, shadowUbo },
    uboSize,
    ui,
    physics,
  });

  

  startFrameLoop();
}

function initPhysics(Ammo, boardMesh) {
  const collisionConfig = new Ammo.btDefaultCollisionConfiguration();
  const dispatcher      = new Ammo.btCollisionDispatcher(collisionConfig);
  const broadphase      = new Ammo.btDbvtBroadphase();
  const solver          = new Ammo.btSequentialImpulseConstraintSolver();
  const dynamicsWorld   = new Ammo.btDiscreteDynamicsWorld(
    dispatcher,
    broadphase,
    solver,
    collisionConfig
  );
  dynamicsWorld.setGravity(new Ammo.btVector3(0, -9.81, 0));

  // --- Floor tilt state ---
  let floorPitch = 0.0;   // radians
  let floorRoll  = 0.0;

  // NEW: input axes from keyboard (-1..1)
  let inputForward = 0.0; // +1 = tilt "forward" (ArrowUp), -1 = back
  let inputRight   = 0.0; // +1 = tilt right (ArrowRight), -1 = left

  const floorPos = [0, -1, 0];

  // --- FLOOR: static mesh collider ---
  {
    const positions = boardMesh.positions;
    const indices   = boardMesh.indices;

    const triMesh = new Ammo.btTriangleMesh();

    for (let i = 0; i < indices.length; i += 3) {
      const vi0 = indices[i + 0];
      const vi1 = indices[i + 1];
      const vi2 = indices[i + 2];

      const i0 = vi0 * 4;
      const i1 = vi1 * 4;
      const i2 = vi2 * 4;

      const v0 = new Ammo.btVector3(
        positions[i0 + 0],
        positions[i0 + 1],
        positions[i0 + 2]
      );
      const v1 = new Ammo.btVector3(
        positions[i1 + 0],
        positions[i1 + 1],
        positions[i1 + 2]
      );
      const v2 = new Ammo.btVector3(
        positions[i2 + 0],
        positions[i2 + 1],
        positions[i2 + 2]
      );

      triMesh.addTriangle(v0, v1, v2, true);
    }

    const useQuantizedAabbCompression = true;
    const buildBvh = true;
    const groundShape = new Ammo.btBvhTriangleMeshShape(
      triMesh,
      useQuantizedAabbCompression,
      buildBvh
    );

    const groundTransform = new Ammo.btTransform();
    groundTransform.setIdentity();
    groundTransform.setOrigin(
      new Ammo.btVector3(floorPos[0], floorPos[1], floorPos[2])
    );

    const mass         = 0;
    const motionState  = new Ammo.btDefaultMotionState(groundTransform);
    const localInertia = new Ammo.btVector3(0, 0, 0);

    const rbInfo = new Ammo.btRigidBodyConstructionInfo(
      mass,
      motionState,
      groundShape,
      localInertia
    );

    const groundBody = new Ammo.btRigidBody(rbInfo);
    dynamicsWorld.addRigidBody(groundBody);

    groundBody.setFriction(0.5);
    groundBody.setRestitution(0.0);
  }

  // --- BALL ---
  const radius      = 1;
  const startHeight = 5;
  const ballShape   = new Ammo.btSphereShape(radius);

  const ballTransform = new Ammo.btTransform();
  ballTransform.setIdentity();
  ballTransform.setOrigin(new Ammo.btVector3(0, startHeight, 0));

  const ballMass     = 1;
  const ballInertia  = new Ammo.btVector3(0, 0, 0);
  ballShape.calculateLocalInertia(ballMass, ballInertia);

  const ballMotionState = new Ammo.btDefaultMotionState(ballTransform);
  const ballRbInfo = new Ammo.btRigidBodyConstructionInfo(
    ballMass,
    ballMotionState,
    ballShape,
    ballInertia
  );
  const ballBody = new Ammo.btRigidBody(ballRbInfo);
  dynamicsWorld.addRigidBody(ballBody);

  ballBody.setFriction(0.3);
  ballBody.setRollingFriction(0.02);
  ballBody.setRestitution(0.0);
  ballBody.setActivationState(4);

  const tmpTransform = new Ammo.btTransform();
  const tmpBallQuat  = new Ammo.btQuaternion();

  return {
    // dt is 1/60 from your frame loop
    step(dt) {
      // --- integrate tilt from input ---
      const tiltSpeed = 0.2; // rad/s ≈ 57°/s, tweak to taste

      floorPitch += inputForward * tiltSpeed * dt;
      floorRoll  += inputRight   * tiltSpeed * dt;

      // optional: clamp max tilt so it doesn’t go crazy
      const maxTilt = 25 * Math.PI / 180; // 25 degrees
      if (floorPitch >  maxTilt) floorPitch =  maxTilt;
      if (floorPitch < -maxTilt) floorPitch = -maxTilt;
      if (floorRoll  >  maxTilt) floorRoll  =  maxTilt;
      if (floorRoll  < -maxTilt) floorRoll  = -maxTilt;

      // --- rotate gravity based on CURRENT tilt ---
      const g  = 9.81;
      const cp = Math.cos(floorPitch);
      const sp = Math.sin(floorPitch);
      const cr = Math.cos(floorRoll);
      const sr = Math.sin(floorRoll);

      const gx =  g * cp * sr;
      const gy = -g * cp * cr;
      const gz = -g * sp;

      dynamicsWorld.setGravity(new Ammo.btVector3(gx, gy, gz));
      dynamicsWorld.stepSimulation(dt, 10);
    },

    getBallPosition() {
      ballBody.getMotionState().getWorldTransform(tmpTransform);
      const origin = tmpTransform.getOrigin();
      return [origin.x(), origin.y(), origin.z()];
    },

    getBallTransform() {
      ballBody.getMotionState().getWorldTransform(tmpTransform);
      const origin = tmpTransform.getOrigin();
      const rot    = tmpTransform.getRotation(tmpBallQuat);

      return {
        position: [origin.x(), origin.y(), origin.z()],
        rotation: [rot.x(), rot.y(), rot.z(), rot.w()],
      };
    },

    getFloorPositionAndRotation() {
      return {
        position: floorPos.slice(),
        pitch: floorPitch,
        roll: floorRoll,
      };
    },

    // NEW: continuous input instead of discrete angle jumps
    setTiltInput(forward, right) {
      inputForward = forward; // -1..1
      inputRight   = right;   // -1..1
    },
  };
}


// ----------------------
// Texture loader helper
// ----------------------
async function loadTexture(device, url) {
  const img = new Image();
  img.src = url;
  img.crossOrigin = "anonymous";
  await img.decode();

  const bitmap = await createImageBitmap(img);
  const texture = device.createTexture({
    size: [bitmap.width, bitmap.height],
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });

  device.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, [
    bitmap.width,
    bitmap.height,
  ]);

  return texture.createView();
}
