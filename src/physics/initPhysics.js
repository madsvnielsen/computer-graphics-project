export function initPhysics(Ammo, boardMesh) {
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

  let floorPitch = 0.0;
  let floorRoll = 0.0;
  let inputForward = 0.0;
  let inputRight = 0.0;

  const floorPos = [0, -1, 0];

  {
    const positions = boardMesh.positions;
    const indices = boardMesh.indices;
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

    const groundShape = new Ammo.btBvhTriangleMeshShape(triMesh, true, true);
    const groundTransform = new Ammo.btTransform();
    groundTransform.setIdentity();
    groundTransform.setOrigin(
      new Ammo.btVector3(floorPos[0], floorPos[1], floorPos[2])
    );

    const mass = 0;
    const motionState = new Ammo.btDefaultMotionState(groundTransform);
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

  const radius = 1;
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

  ballBody.setFriction(0.3);
  ballBody.setRollingFriction(0.02);
  ballBody.setRestitution(0.0);
  ballBody.setActivationState(4);

  const tmpTransform = new Ammo.btTransform();
  const tmpBallQuat = new Ammo.btQuaternion();
  const resetThresholdY = -10;

  function resetBall() {
    floorPitch = 0.0;
    floorRoll = 0.0;
    dynamicsWorld.setGravity(new Ammo.btVector3(0, -9.81, 0));

    tmpTransform.setIdentity();
    tmpTransform.setOrigin(new Ammo.btVector3(0, startHeight, 0));
    ballBody.setWorldTransform(tmpTransform);
    ballBody.getMotionState().setWorldTransform(tmpTransform);

    ballBody.setLinearVelocity(new Ammo.btVector3(0, 0, 0));
    ballBody.setAngularVelocity(new Ammo.btVector3(0, 0, 0));
    ballBody.clearForces();

    ballBody.setActivationState(4);
  }

  return {
    step(dt) {
      const tiltSpeed = 0.4;

      floorPitch += inputForward * tiltSpeed * dt;
      floorRoll += inputRight * tiltSpeed * dt;

      const maxTilt = (25 * Math.PI) / 180;
      if (floorPitch > maxTilt) floorPitch = maxTilt;
      if (floorPitch < -maxTilt) floorPitch = -maxTilt;
      if (floorRoll > maxTilt) floorRoll = maxTilt;
      if (floorRoll < -maxTilt) floorRoll = -maxTilt;

      const g = 9.81;
      const cp = Math.cos(floorPitch);
      const sp = Math.sin(floorPitch);
      const cr = Math.cos(floorRoll);
      const sr = Math.sin(floorRoll);

      const gx = g * cp * sr;
      const gy = -g * cp * cr;
      const gz = -g * sp;

      dynamicsWorld.setGravity(new Ammo.btVector3(gx, gy, gz));
      dynamicsWorld.stepSimulation(dt, 10);

      ballBody.getMotionState().getWorldTransform(tmpTransform);
      const origin = tmpTransform.getOrigin();
      if (origin.y() < resetThresholdY) {
        resetBall();
      }
    },

    getBallPosition() {
      ballBody.getMotionState().getWorldTransform(tmpTransform);
      const origin = tmpTransform.getOrigin();
      return [origin.x(), origin.y(), origin.z()];
    },

    getBallTransform() {
      ballBody.getMotionState().getWorldTransform(tmpTransform);
      const origin = tmpTransform.getOrigin();
      const rot = tmpTransform.getRotation(tmpBallQuat);

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

    setTiltInput(forward, right) {
      inputForward = forward;
      inputRight = right;
    },

    resetBall,
  };
}
