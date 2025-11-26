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

  // NEW: initialize Ammo from global script
  const AmmoLib = await Ammo();

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
    await loadModelBuffers(device, "../models/sphere.obj");

  // NEW: include extra mat4 (model)
  const uboSize = 16 * 4 * 2 + 4 * 4 * 6;
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

  // NEW: init physics (floor + ball)
  const physics = initPhysics(AmmoLib);

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
    physics,        // NEW
  });

  startFrameLoop();
}

// NEW: Physics helper
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
  const radius = 1;   // should match your sphere.obj radius
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