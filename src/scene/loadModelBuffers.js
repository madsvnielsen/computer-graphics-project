export async function loadModelBuffers(device, url) {
  const obj = await readOBJFile(url, 1.0, true);
  if (!obj) {
    throw new Error("OBJ load failed: " + url);
  }

  const positions =
    obj.vertices instanceof Float32Array
      ? obj.vertices
      : new Float32Array(obj.vertices);

  const normals =
    obj.normals instanceof Float32Array
      ? obj.normals
      : new Float32Array(obj.normals);

  const indices =
    obj.indices instanceof Uint32Array
      ? obj.indices
      : new Uint32Array(obj.indices);

  const uvData =
    obj.uvs instanceof Float32Array ? obj.uvs : new Float32Array(obj.uvs);

  function makeVB(data) {
    const buf = device.createBuffer({
      size: data.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(buf, 0, data);
    return buf;
  }

  const vbuf = makeVB(positions);
  const nbuf = makeVB(normals);
  const uvbuf = makeVB(uvData);

  const ibuf = device.createBuffer({
    size: indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(ibuf, 0, indices);

  return {
    vbuf,
    nbuf,
    uvbuf,
    ibuf,
    indexCount: indices.length,
    positions,
    indices,
  };
}
