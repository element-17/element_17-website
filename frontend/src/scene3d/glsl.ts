/** 着色器共用的值噪声 + fbm（天穹云层、河面波纹都用它） */
export const NOISE_GLSL = /* glsl */ `
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }
  float fbm(vec2 p) {
    float a = 0.5;
    float s = 0.0;
    for (int i = 0; i < 5; i++) {
      s += a * vnoise(p);
      p = p * 2.03 + 17.0;
      a *= 0.5;
    }
    return s;
  }
  // 低画质用的两层噪声：开销不到完整 fbm 的一半
  float fbm2(vec2 p) {
    return 0.65 * vnoise(p) + 0.35 * vnoise(p * 2.07 + 17.0);
  }
`
