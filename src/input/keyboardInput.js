export function setupKeyboardInput(physics) {
  const keyState = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
  };

  function updateTiltInput() {
    let forward = 0;
    if (keyState.ArrowUp) forward += 1;
    if (keyState.ArrowDown) forward -= 1;

    let right = 0;
    if (keyState.ArrowRight) right += 1;
    if (keyState.ArrowLeft) right -= 1;

    if (forward !== 0 && right !== 0) {
      const invLen = 1 / Math.sqrt(2);
      forward *= invLen;
      right *= invLen;
    }

    physics.setTiltInput(forward, right);
  }

  window.addEventListener("keydown", (e) => {
    if (e.key in keyState) {
      if (!keyState[e.key]) {
        keyState[e.key] = true;
        updateTiltInput();
      }
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
}
