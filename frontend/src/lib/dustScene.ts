import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderer,
} from 'three'
import type { TargetPoint } from './mask'

/**
 * The intro's particle system: a field of dust that drifts, then converges into
 * the brand, then dissipates as the dashboard takes over.
 *
 * Everything is one `Points` object with one custom shader. Per-particle state
 * lives in attributes and the whole animation is a single uniform (`uProgress`)
 * fed from a timeline in `BrandIntro`, so the CPU does one buffer write per
 * frame instead of updating thousands of positions in JS. That is what keeps it
 * smooth on a mid-range phone.
 *
 * Colour is additively blended, which is what makes overlapping specks read as
 * glow rather than as flat discs.
 */

/** Frames of dust while it is drifting freely. */
const DUST_COUNT = 1400
/** Particles that will form the logo. Several settle onto the same cell so the
 *  letterforms read solid rather than stippled. */
const FORM_COUNT = 7000
const TOTAL = DUST_COUNT + FORM_COUNT

export interface DustScene {
  /** The element to mount. Owned by the scene, removed on dispose. */
  readonly canvas: HTMLCanvasElement
  /** Advances the animation. `progress` 0..1 drives drift → form → release. */
  setProgress: (progress: number) => void
  setSize: (width: number, height: number) => void
  render: () => void
  dispose: () => void
}

const vertexShader = /* glsl */ `
  attribute vec3 aTarget;     // where this particle settles in the logo
  attribute vec3 aScatter;    // its starting offset while drifting
  attribute float aPhase;     // desync for the drift waves
  attribute float aInk;       // 0 for pure dust, >0 for a logo particle
  attribute float aRank;      // 0..1, when this particle locks into place
  attribute float aSize;

  uniform float uProgress;    // 0..1 across the whole sequence
  uniform float uPixelRatio;
  uniform float uTime;

  varying float vAlpha;
  varying float vHeat;

  void main() {
    // --- Drift -------------------------------------------------------------
    // Slow wandering, incommensurate frequencies so nothing pulses in unison.
    vec3 drift = vec3(
      sin(uTime * 0.31 + aPhase * 6.28),
      cos(uTime * 0.27 + aPhase * 4.19),
      sin(uTime * 0.19 + aPhase * 2.71)
    ) * vec3(0.55, 0.42, 0.85);

    vec3 start = aScatter + drift;

    // --- Assemble ----------------------------------------------------------
    // Each particle has its own start and end time inside the formation window,
    // so the logo builds up from its solid parts outward instead of snapping on
    // as a whole. aInk is 0 for dust, which never forms: it just fades.
    float formStart = 0.12 + aRank * 0.34;
    float t = clamp((uProgress - formStart) / 0.30, 0.0, 1.0);
    // Ease-out quint: fast approach, gentle settle. Reads as "drawn together".
    float e = 1.0 - pow(1.0 - t, 5.0);

    // A curved approach: particles swing in slightly from their own side rather
    // than travelling in a straight line, which avoids a mechanical funnel.
    vec3 arc = normalize(vec3(aScatter.y, -aScatter.x, aScatter.z * 0.5) + 0.0001) * (1.0 - e) * e * 1.35;

    vec3 formed = mix(start, aTarget, e) + arc * (1.0 - e) * 0.9;
    // The mark gathers a little above the centre line: the name resolves beneath
    // it, and the pair have to read as one lockup, not a mark with a caption.
    formed.y += aInk > 0.0 ? 1.95 : 0.0;

    // --- Release -----------------------------------------------------------
    // After holding, the formed logo is pushed gently toward the viewer and
    // fades, so the dashboard is revealed from behind it.
    float release = clamp((uProgress - 0.80) / 0.20, 0.0, 1.0);
    formed.z += release * (aInk > 0.0 ? 3.0 : 1.2) * (0.4 + aRank);

    vec3 pos = mix(start, formed, smoothstep(0.0, 0.55, uProgress));

    // --- Presence ----------------------------------------------------------
    // Dust is faint and constant; logo particles brighten as they lock in.
    float settle = smoothstep(formStart, formStart + 0.24, uProgress);
    float baseAlpha = aInk > 0.0 ? mix(0.16, 0.85, settle) : 0.34;
    // Fade the whole field in at the very start and out at the very end.
    baseAlpha *= smoothstep(0.0, 0.06, uProgress) * (1.0 - smoothstep(0.86, 1.0, uProgress));

    vAlpha = baseAlpha;
    vHeat = aInk > 0.0 ? settle : 0.0;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio * (14.0 / -mv.z);
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uAccent;
  uniform vec3 uInk;

  varying float vAlpha;
  varying float vHeat;

  void main() {
    // Round, soft speck. Nothing survives past the disc, so no square corners.
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = length(d);
    if (r > 0.5) discard;
    float falloff = smoothstep(0.5, 0.0, r);
    // A hot core with a wider halo is what reads as glow when blended.
    float core = smoothstep(0.22, 0.0, r);

    vec3 colour = mix(uAccent, uInk, clamp(vHeat * 1.15, 0.0, 1.0));
    gl_FragColor = vec4(colour, (falloff * 0.55 + core * 0.75) * vAlpha);
  }
`

function readToken(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

export function createDustScene(targets: TargetPoint[], aspect = 1): DustScene | null {
  let renderer: WebGLRenderer
  try {
    renderer = new WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'low-power' })
  } catch {
    // No WebGL. The caller falls back to the CSS intro rather than a blank page.
    return null
  }
  renderer.setClearColor(0x000000, 0)
  renderer.domElement.className = 'brand-intro-canvas'

  const scene = new Scene()
  const camera = new PerspectiveCamera(48, 1, 0.1, 100)
  camera.position.set(0, 0, 12)

  const positions = new Float32Array(TOTAL * 3)
  const targetPos = new Float32Array(TOTAL * 3)
  const scatter = new Float32Array(TOTAL * 3)
  const phases = new Float32Array(TOTAL)
  const inks = new Float32Array(TOTAL)
  const ranks = new Float32Array(TOTAL)
  const sizes = new Float32Array(TOTAL)

  // World units. The icon is square and deliberately large: it is the only
  // thing on screen for the first half of the sequence, and it has to read as a
  // logo rather than a logo-shaped smudge.
  const logoWidth = 7.7
  const points = targets.length > 0 ? targets : [{ x: 0, y: 0, ink: 1 }]
  let peakInk = 0
  for (const p of points) peakInk = Math.max(peakInk, p.ink)

  for (let i = 0; i < TOTAL; i++) {
    const i3 = i * 3
    const isForm = i >= DUST_COUNT

    // Scatter: a flattened shell around the camera axis, so the dust has depth
    // without ever flying through the viewer.
    const theta = Math.random() * Math.PI * 2
    const radius = 3.2 + Math.random() * 6.4
    const depth = (Math.random() - 0.5) * 9
    scatter[i3] = Math.cos(theta) * radius
    scatter[i3 + 1] = Math.sin(theta) * radius * 0.72
    scatter[i3 + 2] = depth

    positions[i3] = scatter[i3]
    positions[i3 + 1] = scatter[i3 + 1]
    positions[i3 + 2] = scatter[i3 + 2]

    phases[i] = Math.random()
    sizes[i] = 0.55 + Math.random() * 1.15

    if (isForm) {
      // Spread the form particles across the sampled artwork, then add a little
      // scatter so the assembled logo has texture instead of looking printed.
      const point = points[i % points.length]
      // The artwork's own aspect decides its height, so a tall mark is not
      // stretched to fill a square.
      // Minimal jitter inside the form. More than this and the assembled mark
      // reads as a cloud that happens to be shield-shaped rather than as a
      // shield made of light.
      targetPos[i3] = (point.x * logoWidth) / 2 + (Math.random() - 0.5) * 0.025
      targetPos[i3 + 1] = (point.y * (logoWidth * aspect)) / 2 + (Math.random() - 0.5) * 0.025
      // A shallow depth inside the form, so the mark has volume without the
      // particles spreading into a haze.
      targetPos[i3 + 2] = (Math.random() - 0.5) * 0.34
      inks[i] = point.ink / (peakInk || 1)
      // Solid ink settles first; edges follow and give the form a soft finish.
      ranks[i] = 1 - inks[i] * 0.75
      sizes[i] = 0.9 + Math.random() * 0.7
    } else {
      // Dust never forms: park its target on top of its own start so it only
      // drifts, dims and fades.
      targetPos[i3] = scatter[i3]
      targetPos[i3 + 1] = scatter[i3 + 1]
      targetPos[i3 + 2] = scatter[i3 + 2]
      inks[i] = 0
      ranks[i] = 0.5
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('aTarget', new BufferAttribute(targetPos, 3))
  geometry.setAttribute('aScatter', new BufferAttribute(scatter, 3))
  geometry.setAttribute('aPhase', new BufferAttribute(phases, 1))
  geometry.setAttribute('aInk', new BufferAttribute(inks, 1))
  geometry.setAttribute('aRank', new BufferAttribute(ranks, 1))
  geometry.setAttribute('aSize', new BufferAttribute(sizes, 1))

  const accent = new Color(readToken('--accent-text', '#f0b070'))
  const ink = new Color(readToken('--ink', '#f5f0e6'))

  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uProgress: { value: 0 },
      uPixelRatio: { value: 1 },
      uTime: { value: 0 },
      uAccent: { value: accent },
      uInk: { value: ink },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: AdditiveBlending,
  })

  const cloud = new Points(geometry, material)
  scene.add(cloud)

  // Reused so the render loop allocates nothing.
  const cameraTarget = new Vector3()
  let disposed = false

  return {
    canvas: renderer.domElement,
    setProgress(progress: number) {
      if (disposed) return
      material.uniforms.uProgress.value = Math.min(1, Math.max(0, progress))
    },
    setSize(width: number, height: number) {
      if (disposed) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      renderer.setPixelRatio(dpr)
      renderer.setSize(width, height, false)
      camera.aspect = width / Math.max(1, height)
      // On a tall phone the horizontal field of view is much narrower, so the
      // camera steps back to keep the logo inside the frame.
      const wide = camera.aspect >= 1
      camera.position.z = wide ? 12 : 12 / Math.max(0.42, camera.aspect)
      camera.updateProjectionMatrix()
      material.uniforms.uPixelRatio.value = dpr * (wide ? 1 : 0.82)
    },
    render() {
      // A queued frame can land after dispose on a slow tab. Writing to a
      // released context is an error, so stop at the door.
      if (disposed) return
      material.uniforms.uTime.value += 1 / 60
      cameraTarget.set(0, 0, 0)
      camera.lookAt(cameraTarget)
      renderer.render(scene, camera)
    },
    dispose() {
      // Every GPU-side allocation this scene owns, released — three.js does not
      // do this for you, and a context left alive keeps its programs and buffers
      // resident for the life of the page. On a phone that is the difference
      // between a stutter-free dashboard and a laggy one.
      geometry.dispose()
      material.dispose()
      scene.clear()
      renderer.dispose()
      // Drops the WebGL context itself, now, rather than whenever the browser
      // next collects it. Browsers cap live contexts (~16); leaking one per
      // visit is how a tab eventually stops being able to draw.
      renderer.forceContextLoss()
      const canvas = renderer.domElement
      canvas.width = 0
      canvas.height = 0
      canvas.parentNode?.removeChild(canvas)
      disposed = true
    },
  }
}
