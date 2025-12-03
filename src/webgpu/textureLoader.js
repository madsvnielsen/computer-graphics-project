export async function loadTexture(device, url) {
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
