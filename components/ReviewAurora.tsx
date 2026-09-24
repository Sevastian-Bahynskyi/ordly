'use client'

// Adapted from React Bits Aurora (MIT): https://reactbits.dev/c/backgrounds/aurora
import { useEffect, useRef } from 'react'
import { Renderer, Program, Mesh, Color, Triangle } from 'ogl';

const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = `#version 300 es
precision highp float;

uniform float uTime;
uniform float uAmplitude;
uniform vec3 uColorStops[3];
uniform vec2 uResolution;
uniform float uBlend;
uniform float uLightMode;

out vec4 fragColor;

vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v){
  const vec4 C = vec4(
      0.211324865405187, 0.366025403784439,
      -0.577350269189626, 0.024390243902439
  );
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);

  vec3 p = permute(
      permute(i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0)
  );

  vec3 m = max(
      0.5 - vec3(
          dot(x0, x0),
          dot(x12.xy, x12.xy),
          dot(x12.zw, x12.zw)
      ), 
      0.0
  );
  m = m * m;
  m = m * m;

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);

  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

struct ColorStop {
  vec3 color;
  float position;
};

#define COLOR_RAMP(colors, factor, finalColor) {              \
  int index = 0;                                            \
  for (int i = 0; i < 2; i++) {                               \
     ColorStop currentColor = colors[i];                    \
     bool isInBetween = currentColor.position <= factor;    \
     index = int(mix(float(index), float(i), float(isInBetween))); \
  }                                                         \
  ColorStop currentColor = colors[index];                   \
  ColorStop nextColor = colors[index + 1];                  \
  float range = nextColor.position - currentColor.position; \
  float lerpFactor = (factor - currentColor.position) / range; \
  finalColor = mix(currentColor.color, nextColor.color, lerpFactor); \
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  
  ColorStop colors[3];
  colors[0] = ColorStop(uColorStops[0], 0.0);
  colors[1] = ColorStop(uColorStops[1], 0.5);
  colors[2] = ColorStop(uColorStops[2], 1.0);
  
  vec3 rampColor;
  COLOR_RAMP(colors, uv.x, rampColor);
  
  float height = snoise(vec2(uv.x * 2.0 + uTime * 0.1, uTime * 0.25)) * 0.5 * uAmplitude;
  height = exp(height);
  height = (uv.y * 2.0 - height + 0.2);
  float intensity = 0.6 * height;
  
  float midPoint = 0.20;
  float auroraAlpha = smoothstep(midPoint - uBlend * 0.5, midPoint + uBlend * 0.5, intensity);
  
  vec3 auroraColor = intensity * rampColor;
  
  if (uLightMode > 0.5) {
    float energy = clamp(max(intensity, 0.0), 0.0, 1.0);
    float coverage = clamp(auroraAlpha * (0.55 + 0.45 * energy), 0.0, 0.86);
    vec3 chroma = pow(clamp(rampColor, 0.0, 1.0), vec3(1.2));
    float chromaPeak = max(chroma.r, max(chroma.g, chroma.b));
    chroma /= max(chromaPeak, 0.0001);
    fragColor = vec4(mix(vec3(1.0), chroma, min(coverage * 1.08, 0.94)), 1.0);
  } else {
    fragColor = vec4(auroraColor * auroraAlpha, auroraAlpha);
  }
}
`;

export function ReviewAurora(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let renderer: Renderer
    try {
      renderer = new Renderer({ alpha: true, antialias: false, dpr: Math.min(window.devicePixelRatio, 1.5) })
    } catch {
      return
    }

    const gl = renderer.gl
    const geometry = new Triangle(gl)
    if (geometry.attributes.uv) delete geometry.attributes.uv

    const styles = getComputedStyle(document.documentElement)
    const colors = ['--purple-soft', '--pink', '--purple-2'].map((token) => {
      const color = new Color(styles.getPropertyValue(token).trim())
      return [color.r, color.g, color.b]
    })
    const program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uAmplitude: { value: 0.65 },
        uColorStops: { value: colors },
        uResolution: { value: [1, 1] },
        uBlend: { value: 0.6 },
        uLightMode: { value: 1 },
      },
    })
    const mesh = new Mesh(gl, { geometry, program })
    container.appendChild(gl.canvas)

    const resize = () => {
      const width = container.clientWidth
      const height = container.clientHeight
      if (width && height) {
        renderer.setSize(width, height)
        program.uniforms.uResolution.value = [width, height]
        renderer.render({ scene: mesh })
      }
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    resize()

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let inView = false
    let frame = 0
    let lastFrame = 0
    const draw = (time: number) => {
      if (time - lastFrame >= 32) {
        program.uniforms.uTime.value = time * 0.00022
        renderer.render({ scene: mesh })
        lastFrame = time
      }
      frame = requestAnimationFrame(draw)
    }
    const update = () => {
      const shouldAnimate = inView && !document.hidden && !motion.matches
      if (shouldAnimate && !frame) frame = requestAnimationFrame(draw)
      if (!shouldAnimate && frame) {
        cancelAnimationFrame(frame)
        frame = 0
      }
    }
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting
      update()
    })
    visibilityObserver.observe(container)
    document.addEventListener('visibilitychange', update)
    motion.addEventListener('change', update)

    return () => {
      cancelAnimationFrame(frame)
      visibilityObserver.disconnect()
      resizeObserver.disconnect()
      document.removeEventListener('visibilitychange', update)
      motion.removeEventListener('change', update)
      container.removeChild(gl.canvas)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [])

  return <div ref={containerRef} className="review-aurora" aria-hidden="true" />
}
