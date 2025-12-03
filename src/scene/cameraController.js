export function createCameraController(canvas) {
  let yaw = 0.0;
  let pitch = 0.3;
  const radius = 25.0;

  let isDragging = false;
  let lastX = 0;
  let lastY = 0;
  const rotateSpeed = 0.005;

  canvas.addEventListener("mousedown", (e) => {
    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });

  window.addEventListener("mouseup", () => {
    isDragging = false;
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    yaw += dx * rotateSpeed;
    pitch += dy * rotateSpeed;
  });

  return {
    getYaw: () => yaw,
    getPitch: () => pitch,
    radius,
  };
}
