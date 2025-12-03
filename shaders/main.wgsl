struct Uniforms {
  mvp      : mat4x4<f32>,
  model    : mat4x4<f32>,
  eye      : vec4<f32>,
  lightPos : vec4<f32>,
  kd_u     : vec4<f32>,
  ks       : vec4<f32>,
  scales   : vec4<f32>,
  ambient  : vec4<f32>,
};

@group(0) @binding(0) var<uniform> U : Uniforms;
@group(0) @binding(1) var myColorTex: texture_2d<f32>;
@group(0) @binding(2) var mySampler: sampler;

// ---- Vertex ----

struct VSOut {
  @builtin(position) clipPos : vec4<f32>,
  @location(0) posWS : vec3<f32>,
  @location(1) nWS   : vec3<f32>,
  @location(2) uv    : vec2<f32>,
};

@vertex
fn main_vs(
  @location(0) pos: vec4<f32>,
  @location(1) nrm: vec4<f32>,
  @location(2) uvIn: vec2<f32>
) -> VSOut {
  var out: VSOut;

  let worldPos = U.model * pos;
  let worldNrm = (U.model * vec4<f32>(nrm.xyz, 0.0)).xyz;

  out.clipPos = U.mvp * worldPos;
  out.posWS   = worldPos.xyz;
  out.nWS     = normalize(worldNrm);
  out.uv      = uvIn;

  return out;
}

// ---- Fragment ----

@fragment
fn main_fs(
  @location(0) posWS: vec3<f32>,
  @location(1) nWS  : vec3<f32>,
  @location(2) uv   : vec2<f32>
) -> @location(0) vec4<f32> {

  // Sample base color only (no normal/rough maps yet)
  let baseColor = textureSample(myColorTex, mySampler, uv).rgb;

  let n = normalize(nWS);

  let toLight = U.lightPos.xyz - posWS;
  let dist2   = max(dot(toLight, toLight), 1e-6);
  let l       = normalize(toLight);
  let v       = normalize(U.eye.xyz - posWS);
  let r       = reflect(-l, n);

  let kdScale   = U.scales.x;
  let ksScale   = U.scales.y;
  let shininess = max(U.scales.z, 1.0);
  let Le        = U.scales.w;
  let La        = U.ambient.rgb;

  let atten = 1.0 / dist2;

  let ambient = La * baseColor * kdScale;
  let ndotl   = max(dot(n, l), 0.0);
  let diffuse = baseColor * (Le * ndotl * kdScale) * atten;

  let rdv  = max(dot(r, v), 0.0);
  let spec = U.ks.rgb * (Le * pow(rdv, shininess) * ksScale) * atten;

  let finalColor = clamp(ambient + diffuse + spec, vec3<f32>(0.0), vec3<f32>(10.0));

  return vec4<f32>(finalColor, 1.0);
    //return vec4<f32>(uv, 0.0, 1.0);
}

// =========================
// SHADOW PASS SHADERS
// =========================
struct ShadowVSOut {
  @builtin(position) clipPos : vec4<f32>,
};

@vertex
fn shadow_vs(
  @location(0) pos: vec4<f32>,
  @location(1) nrm: vec4<f32>
) -> ShadowVSOut {
  var out: ShadowVSOut;

  let worldPos = U.model * pos;
  out.clipPos = U.mvp * worldPos;

  return out;
}

@fragment
fn shadow_fs() -> @location(0) vec4<f32> {
  let shadowAlpha = 0.6;
  return vec4<f32>(0.0, 0.0, 0.0, shadowAlpha);
}
