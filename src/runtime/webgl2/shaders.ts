/**
 * GLSL ES 3.00 sources of the WebGL2 scene view. Not interchangeable with
 * AGSL (Android): see docs/android-mapping.md for the planned mapping.
 *
 * Coordinates: CSS px of the canvas with a top-left origin, converted with
 * u_k (device pixels per CSS px). Textures rendered by the view keep the GL
 * orientation (bottom-left origin); the lens map is uploaded row 0 first, so
 * its v coordinate grows downwards like the map rows.
 */

export const VERTEX = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

/** Source pass: pattern (procedural, deterministic in u_time) or a texture drawn with "cover" fit. */
export const SOURCE = `#version 300 es
precision highp float;
uniform vec2 u_res;
uniform float u_k;
uniform float u_time;
uniform int u_pattern;      // 0 grid, 1 blocks, 2 bands, 3 neutral, -1 texture
uniform sampler2D u_tex;
uniform vec2 u_cover;       // texture uv scale for cover fit
out vec4 o;

vec3 palette(int i) {
  if (i == 0) return vec3(1.0, 0.27, 0.23);
  if (i == 1) return vec3(1.0, 0.62, 0.04);
  if (i == 2) return vec3(1.0, 0.84, 0.04);
  if (i == 3) return vec3(0.19, 0.82, 0.35);
  if (i == 4) return vec3(0.39, 0.82, 1.0);
  if (i == 5) return vec3(0.04, 0.52, 1.0);
  if (i == 6) return vec3(0.37, 0.36, 0.9);
  if (i == 7) return vec3(0.75, 0.35, 0.95);
  if (i == 8) return vec3(0.11, 0.11, 0.12);
  return vec3(0.95, 0.95, 0.97);
}

void main() {
  if (u_pattern < 0) {
    vec2 uv = gl_FragCoord.xy / u_res;
    o = vec4(texture(u_tex, (uv - 0.5) * u_cover + 0.5).rgb, 1.0);
    return;
  }
  if (u_pattern == 3) { o = vec4(0.5, 0.5, 0.52, 1.0); return; }
  vec2 p = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y) / u_k;
  vec3 c;
  if (u_pattern == 0) {
    p += u_time * vec2(18.0, 9.0);
    vec2 cell = floor(p / 40.0);
    vec2 f = mod(p, 40.0);
    c = vec3(0.965, 0.965, 0.955);
    if (mod(cell.x + cell.y * 3.0, 7.0) == 0.0) c = mix(c, palette(int(mod(cell.x + cell.y, 8.0))), 0.85);
    float line = step(f.x, 2.0) + step(f.y, 2.0);
    c = mix(c, vec3(0.086, 0.086, 0.1), clamp(line, 0.0, 1.0));
  } else if (u_pattern == 1) {
    vec2 q = p + vec2(u_time * 14.0, 0.0);
    vec2 cell = floor(q / 72.0);
    c = palette(int(mod(cell.x * 5.0 + cell.y * 3.0, 10.0)));
  } else {
    float d = (p.x + p.y) * 0.7071 - u_time * 30.0;
    c = palette(int(mod(floor(d / 36.0), 8.0)));
  }
  o = vec4(c, 1.0);
}
`;

/** Separable Gaussian, one direction per pass, weights from the CPU. */
export const BLUR = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_res;         // target size
uniform vec2 u_dir;         // texel step in uv of the source
uniform float u_lod;
uniform int u_taps;         // half kernel incl. centre
uniform float u_w[8];
uniform float u_o[8];
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec3 acc = textureLod(u_tex, uv, u_lod).rgb * u_w[0];
  for (int i = 1; i < 8; i++) {
    if (i >= u_taps) break;
    vec2 d = u_dir * u_o[i];
    acc += textureLod(u_tex, uv + d, u_lod).rgb * u_w[i];
    acc += textureLod(u_tex, uv - d, u_lod).rgb * u_w[i];
  }
  o = vec4(acc, 1.0);
}
`;

export const COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D u_scene;
uniform sampler2D u_blur;
uniform sampler2D u_map;
uniform vec2 u_res;
uniform float u_k;
uniform vec4 u_lens;        // x, y, w, h (CSS px, unscaled, top-left)
uniform vec2 u_scale;       // transient scale (press, stretch)
uniform float u_radius;
uniform float u_refraction;
uniform float u_chroma;
uniform float u_useBlur;
uniform mat3 u_sat;
uniform vec3 u_tint;
uniform float u_tintA;
uniform float u_light;
uniform float u_lightAngle; // radians, CSS gradient angle
uniform float u_press;
uniform vec2 u_pointer;     // 0..1 in the lens
uniform float u_pressLight;
uniform float u_shadow;
uniform float u_shadowBlur;
uniform float u_shadowY;
uniform float u_opaque;
uniform vec3 u_opaqueColor;
out vec4 o;

float sdRoundedRect(vec2 p, vec2 h, float r) {
  vec2 q = abs(p) - h + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec3 sampleAt(vec2 css) {
  vec2 uv = vec2(css.x * u_k, u_res.y - css.y * u_k) / u_res;
  return u_useBlur > 0.5 ? texture(u_blur, uv).rgb : texture(u_scene, uv).rgb;
}

void main() {
  vec2 css = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y) / u_k;
  vec3 base = texture(u_scene, gl_FragCoord.xy / u_res).rgb;
  vec2 size = u_lens.zw;
  vec2 centre = u_lens.xy + size * 0.5;
  vec2 halfSize = size * 0.5 * u_scale;
  vec2 local = css - centre;
  float r = min(u_radius * min(u_scale.x, u_scale.y), min(halfSize.x, halfSize.y));
  float sd = sdRoundedRect(local, halfSize, r);

  // Drop shadow like the CSS layer: 0 Y blur -6px spread.
  float sdS = sdRoundedRect(local - vec2(0.0, u_shadowY), halfSize - 6.0, max(r - 6.0, 0.0));
  float sigma = max(u_shadowBlur * 0.5, 0.5);
  float sh = u_shadow * (1.0 - smoothstep(-sigma, sigma * 1.6, sdS));
  base *= 1.0 - sh * step(0.0, sd);

  float cov = clamp(0.5 - sd * u_k, 0.0, 1.0);
  if (cov <= 0.0) { o = vec4(base, 1.0); return; }

  vec3 col;
  if (u_opaque > 0.5) {
    col = u_opaqueColor;
  } else {
    vec2 muv = (local / u_scale + size * 0.5) / size;
    vec2 d = (texture(u_map, muv).rg * 255.0 - 128.0) / 127.0;
    vec2 sp = css + u_refraction * d;
    if (u_chroma > 0.0) {
      float s = 0.12 * u_chroma;
      col = vec3(
        sampleAt(css + u_refraction * (1.0 + s) * d).r,
        sampleAt(sp).g,
        sampleAt(css + u_refraction * (1.0 - s) * d).b);
    } else {
      col = sampleAt(sp);
    }
    col = clamp(u_sat * col, 0.0, 1.0);
    col = mix(col, u_tint, u_tintA);

    // Rim: a 1.25 px ring with the CSS gradient (bright at 0%, none 32-64%, weaker at 100%).
    vec2 dir = vec2(sin(u_lightAngle), -cos(u_lightAngle));
    float len = abs(size.x * u_scale.x * dir.x) + abs(size.y * u_scale.y * dir.y);
    float t = 0.5 + dot(local, dir) / max(len, 1.0);
    float a0 = (u_light + u_press * 0.2) * 0.95;
    float a1 = u_light * 0.45;
    float g = t < 0.32 ? mix(a0, 0.0, t / 0.32) : t > 0.64 ? mix(0.0, a1, (t - 0.64) / 0.36) : 0.0;
    float ring = clamp((sd + 1.25) * u_k, 0.0, 1.0);
    col = mix(col, vec3(1.0), clamp(g, 0.0, 1.0) * ring);

    // Contact light while pressed.
    vec2 pc = (u_pointer - 0.5) * size * u_scale;
    vec2 far = halfSize + abs(pc);
    float radius = length(far) * 0.62;
    float pl = u_pressLight * 0.55 * u_press * (1.0 - clamp(length(local - pc) / max(radius, 1.0), 0.0, 1.0));
    col = mix(col, vec3(1.0), clamp(pl, 0.0, 1.0));
  }
  o = vec4(mix(base, col, cov), 1.0);
}
`;

/** Used only by the diagnostics option `debugBreakShader`. */
export const BROKEN = `#version 300 es
precision highp float;
out vec4 o;
void main() { o = vec4(undefined_symbol, 1.0); }
`;
