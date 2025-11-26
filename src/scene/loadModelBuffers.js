export async function loadModelBuffers(device, url) {
  const obj = await readOBJFile(url, 1.0, true);
  if (!obj) throw new Error("OBJ load failed: " + url);

  const positions = obj.vertices instanceof Float32Array ? obj.vertices : new Float32Array(obj.vertices);
  const normals   = obj.normals  instanceof Float32Array ? obj.normals  : new Float32Array(obj.normals);
  const indices   = obj.indices  instanceof Uint32Array  ? obj.indices  : new Uint32Array(obj.indices);
  const colors    = (obj.colors && obj.colors.length)
    ? (obj.colors instanceof Float32Array ? obj.colors : new Float32Array(obj.colors))
    : new Float32Array((positions.length / 4) * 4).fill(1);

  function makeVB(data, usage) {
    const buf = device.createBuffer({ size: data.byteLength, usage });
    device.queue.writeBuffer(buf, 0, data);
    return buf;
  }

  const vbuf = makeVB(positions, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
  const nbuf = makeVB(normals,   GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
  const cbuf = makeVB(colors,    GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);

  const ibuf = device.createBuffer({
    size: indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(ibuf, 0, indices);

  return { vbuf, nbuf, cbuf, ibuf, indexCount: indices.length };
}
