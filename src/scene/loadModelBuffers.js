export async function loadModelBuffers(device, url) {
  const obj = await readOBJFile(url, 1.0, true);
  if (!obj) throw new Error("OBJ load failed: " + url);

  const positions = obj.vertices instanceof Float32Array
  ? obj.vertices
  : new Float32Array(obj.vertices);

const normals = obj.normals instanceof Float32Array
  ? obj.normals
  : new Float32Array(obj.normals);

const indices = obj.indices instanceof Uint32Array
  ? obj.indices
  : new Uint32Array(obj.indices);

const uvIndices = obj.uvIndices;
const uvs = obj.uvs;

// 2 floats per vertex
const vertexCount = positions.length / 4;
const uvData = new Float32Array(vertexCount * 2);

// Fill per vertex, using the index buffer to map from corner → vertex
for (let i = 0; i < indices.length; i++) {
  const vIdx = indices[i];      // which vertex is this corner using?
  const tIdx = uvIndices[i];    // which UV index for that corner?

  if (tIdx < 0) continue;       // no UV on this face corner
  const uv = uvs[tIdx];
  if (!uv) continue;

  uvData[vIdx * 2 + 0] = uv.x;
  uvData[vIdx * 2 + 1] = 1.0 - uv.y;
}


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

  return { vbuf, nbuf, uvbuf, ibuf, indexCount: indices.length, positions, indices};
}
