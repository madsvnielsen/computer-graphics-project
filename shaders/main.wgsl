struct Uniforms {
  mvp      : mat4x4<f32>,
  eye      : vec4<f32>,   
  lightPos : vec4<f32>,   
  kd_u     : vec4<f32>,  
  ks       : vec4<f32>,   
  scales   : vec4<f32>, 
  ambient  : vec4<f32>,   
};
@group(0) @binding(0) var<uniform> U : Uniforms;

struct VSOut {
  @builtin(position) clipPos : vec4<f32>,
  @location(0) posOS : vec3<f32>,
  @location(1) nOS   : vec3<f32>,
  @location(2) kdCol : vec3<f32>,  
};

@vertex
fn main_vs(@location(0) pos: vec4<f32>,
           @location(1) nrm: vec4<f32>,
           @location(2) col: vec4<f32>) -> VSOut {
  var out : VSOut;
  out.clipPos = U.mvp * pos;
  out.posOS   = pos.xyz;
  out.nOS     = normalize(nrm.xyz); 
  out.kdCol   = col.rgb;
  return out;
}

@fragment
fn main_fs(@location(0) posOS: vec3<f32>,
           @location(1) nOS  : vec3<f32>,
           @location(2) kdCol: vec3<f32>) -> @location(0) vec4<f32> {
  let n = normalize(nOS);

  let toLight = U.lightPos.xyz - posOS;
  let dist2   = max(dot(toLight, toLight), 1e-6);
  let l       = normalize(toLight);

  let v = normalize(U.eye.xyz - posOS);
  let r = reflect(-l, n);

  let kdScale   = U.scales.x;
  let ksScale   = U.scales.y;
  let shininess = max(U.scales.z, 1.0);
  let Le        = U.scales.w;         
  let La        = U.ambient.rgb;

  let atten = 1.0 / dist2;          

  let kd = kdCol;

  let ambient = La * kd * kdScale;
  let ndotl   = max(dot(n, l), 0.0);
  let diffuse = kd * (Le * ndotl * kdScale) * atten;

  let rdv   = max(dot(r, v), 0.0);
  let spec  = U.ks.rgb * (Le * pow(rdv, shininess) * ksScale) * atten;

  let color = clamp(ambient + diffuse + spec, vec3<f32>(0.0), vec3<f32>(10.0));
  return vec4<f32>(color, 1.0);
}
