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

  // --- WebGPU init ---
  const { device, context, canvasFormat } = await initWebGPU(canvas);

  // --- Load WGSL shader code ---
  const wgslScript = document.getElementById("wgsl");
  const code = wgslScript
    ? await fetch(wgslScript.src, { cache: "reload" }).then(r => r.text())
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

  const sphereBuffers =
    await loadModelBuffers(device, "../models/sphere.obj");

  const boardBuffers =
    await loadModelBuffers(device, "../models/board.obj");

  // NEW: include extra mat4 (model)
  // NEW: include extra mat4 (model)
  const uboSize = 16 * 4 * 2 + 4 * 4 * 6;
  const ubo = device.createBuffer({
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
  const texColor = await loadTexture(device, "../textures/ball_diff_4k.jpg");
  //const texNormal = await loadTexture(device, "../textures/ball_nor_gl_4k.png");
  // Prefer PNG/JPG instead of EXR for the browser:
  //const texRough = await loadTexture(device, "../textures/ball_rough_4k.png");

  const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
  });

  // --- Bind group (must match WGSL bindings) ---
// --- Bind group (must match WGSL bindings) ---
const bindGroup = device.createBindGroup({
  layout: bindGroupLayout,  // 🔹 use returned layout here
  entries: [
    { binding: 0, resource: { buffer: ubo }},
    { binding: 1, resource: texColor },
    { binding: 2, resource: sampler },
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



  const camera = createCameraController(canvas);

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
  const physics = initPhysics(AmmoLib);

  // --- Frame loop (render + physics) ---
  const startFrameLoop = createFrameLoop({
    device,
    context,
    pipeline,
    shadowPipeline,        // ✔
    bindGroup,
    shadowBindGroup,       // ✔
    buffers: { sphereBuffers, boardBuffers },
    depth,
    ubo,
    shadowUbo,             // ✔
    camera,
    ui,
    physics,
  });

  

  startFrameLoop();
}

// ----------------------
// Physics helper
// ----------------------
function initPhysics(Ammo) {
  const collisionConfig = new Ammo.btDefaultCollisionConfiguration();
  const dispatcher = new Ammo.btCollisionDispatcher(collisionConfig);
  const broadphase = new Ammo.btDbvtBroadphase();
  const solver = new Ammo.btSequentialImpulseConstraintSolver();
  const dynamicsWorld = new Ammo.btDiscreteDynamicsWorld(
    dispatcher,
    broadphase,
    solver,
    collisionConfig
  );
  dynamicsWorld.setGravity(new Ammo.btVector3(0, -9.81, 0));

  // FLOOR (static box)
  {
    const groundShape = new Ammo.btBoxShape(new Ammo.btVector3(50, 1, 50));
    const groundTransform = new Ammo.btTransform();
    groundTransform.setIdentity();
    groundTransform.setOrigin(new Ammo.btVector3(0, -1, 0)); // y = -1

    const mass = 0;
    const motionState = new Ammo.btDefaultMotionState(groundTransform);
    const localInertia = new Ammo.btVector3(0, 0, 0);
    const rbInfo = new Ammo.btRigidBodyConstructionInfo(
      mass,
      motionState,
      groundShape,
      localInertia
    );
    const body = new Ammo.btRigidBody(rbInfo);
    dynamicsWorld.addRigidBody(body);
  }

  // BALL (dynamic sphere)
  const radius = 1;   // should match sphere.obj radius
  const startHeight = 5;
  const ballShape = new Ammo.btSphereShape(radius);
  const ballTransform = new Ammo.btTransform();
  ballTransform.setIdentity();
  ballTransform.setOrigin(new Ammo.btVector3(0, startHeight, 0));

  const ballMass = 1;
  const ballInertia = new Ammo.btVector3(0, 0, 0);
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

  const tmpTransform = new Ammo.btTransform();

  return {
    step(dt) {
      dynamicsWorld.stepSimulation(dt, 10);
    },
    getBallPosition() {
      ballBody.getMotionState().getWorldTransform(tmpTransform);
      const origin = tmpTransform.getOrigin();
      return [origin.x(), origin.y(), origin.z()];
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

  device.queue.copyExternalImageToTexture(
    { source: bitmap },
    { texture },
    [bitmap.width, bitmap.height]
  );

  return texture.createView();
}
