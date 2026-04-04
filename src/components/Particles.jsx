'use client'
import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { Renderer, Camera, Geometry, Program, Mesh } from 'ogl'
import './Particles.css'

const defaultColors = ['#ffffff', '#ffffff', '#ffffff']

const hexToRgb = hex => {
  hex = hex.replace(/^#/, '')
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('')
  }
  const int = parseInt(hex, 16)
  const r = ((int >> 16) & 255) / 255
  const g = ((int >> 8) & 255) / 255
  const b = (int & 255) / 255
  return [r, g, b]
}

const vertex = /* glsl */ `
  attribute vec3 position;
  attribute vec4 random;
  attribute vec3 color;
  
  uniform mat4 modelMatrix;
  uniform mat4 viewMatrix;
  uniform mat4 projectionMatrix;
  uniform float uTime;
  uniform float uSpreadX;
  uniform float uSpreadY;
  uniform float uBaseSize;
  uniform float uSizeRandomness;
  
  varying vec4 vRandom;
  varying vec3 vColor;
  
  void main() {
    vRandom = random;
    vColor = color;
    
    vec3 pos = vec3(position.x * uSpreadX, position.y * uSpreadY, position.z * 10.0);
    
    vec4 mPos = modelMatrix * vec4(pos, 1.0);
    float t = uTime;
    // 每个粒子独立随机方向漂移，避免整体旋转感
    float ax = sin(t * 0.7 + random.x * 6.28) * mix(0.3, 1.2, random.y);
    float ay = cos(t * 0.5 + random.z * 6.28) * mix(0.3, 1.2, random.w);
    float az = sin(t * 0.9 + random.w * 6.28) * mix(0.1, 0.8, random.x);
    mPos.x += ax * 0.8 - ay * 0.3;
    mPos.y += ay * 0.8 + ax * 0.3;
    mPos.z += az;
    
    vec4 mvPos = viewMatrix * mPos;

    if (uSizeRandomness == 0.0) {
      gl_PointSize = uBaseSize;
    } else {
      gl_PointSize = (uBaseSize * (1.0 + uSizeRandomness * (random.x - 0.5))) / length(mvPos.xyz);
    }

    gl_Position = projectionMatrix * mvPos;
  }
`

const fragment = /* glsl */ `
  precision highp float;
  
  uniform float uTime;
  uniform float uAlphaParticles;
  varying vec4 vRandom;
  varying vec3 vColor;
  
  void main() {
    vec2 uv = gl_PointCoord.xy;
    float d = length(uv - vec2(0.5));
    
    if(uAlphaParticles < 0.5) {
      if(d > 0.5) {
        discard;
      }
      gl_FragColor = vec4(vColor + 0.2 * sin(uv.yxx + uTime + vRandom.y * 6.28), 1.0);
    } else {
      float circle = smoothstep(0.5, 0.4, d) * 0.8;
      gl_FragColor = vec4(vColor + 0.2 * sin(uv.yxx + uTime + vRandom.y * 6.28), circle);
    }
  }
`

const Particles = forwardRef(function Particles({
  particleCount = 200,        // 粒子数量
  particleSpread = 50,       // 粒子分布扩散度
  speed = 0.8,               // 动画速度
  particleColors,            // 粒子颜色数组，如 ['#007bff', '#a600ff']
  moveParticlesOnHover = false,  // 鼠标悬停时是否移动粒子
  particleHoverFactor = 1,   // 鼠标影响粒子位移的系数
  alphaParticles = false,    // 是否启用粒子透明度
  particleBaseSize = 100,   // 粒子基础尺寸
  sizeRandomness = 5,       // 尺寸随机变化幅度
  cameraDistance = 20,      // 相机距离
  disableRotation = false,  // 是否禁用旋转
  pixelRatio = undefined,    // 设备像素比，不传则自动检测
  className = '',
}, ref) {
  const containerRef = useRef(null)
  const mouseRef = useRef({ x: 0, y: 0 })
  const isPausedRef = useRef(false)
  const rafIdRef = useRef(null)
  const updateRef = useRef(null)
  // 固定 dpr=1 降低 GPU 渲染压力，高分屏不再翻倍渲染像素
  const dpr = pixelRatio ?? 1

  // 将运行时可变的 props 存入 ref，供 RAF 闭包读取，避免因 dep 变化重建 context
  const speedRef = useRef(speed)
  const moveParticlesOnHoverRef = useRef(moveParticlesOnHover)
  const particleHoverFactorRef = useRef(particleHoverFactor)
  const disableRotationRef = useRef(disableRotation)
  const programRef = useRef(null)

  // 同步 runtime refs（不触发重建）
  speedRef.current = speed
  moveParticlesOnHoverRef.current = moveParticlesOnHover
  particleHoverFactorRef.current = particleHoverFactor
  disableRotationRef.current = disableRotation

  useImperativeHandle(ref, () => ({
    pause() {
      isPausedRef.current = true
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    },
    resume() {
      if (!isPausedRef.current) return
      isPausedRef.current = false
      if (updateRef.current) rafIdRef.current = requestAnimationFrame(updateRef.current)
    },
  }), [])

  // particleColors 用 JSON 序列化比较，避免数组引用不等导致无意义的重建
  const colorsKey = JSON.stringify(particleColors)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const renderer = new Renderer({
      dpr,
      depth: false,
      alpha: true,
    })
    const gl = renderer.gl
    container.appendChild(gl.canvas)
    gl.clearColor(0, 0, 0, 0)

    const camera = new Camera(gl, { fov: 15 })
    camera.position.set(0, 0, cameraDistance)

    const resize = () => {
      const width = container.clientWidth
      const height = container.clientHeight
      renderer.setSize(width, height)
      camera.perspective({ aspect: gl.canvas.width / gl.canvas.height })
    }
    window.addEventListener('resize', resize, false)
    resize()

    // 根据 banner 可视区域计算粒子分布范围，使粒子填满画面
    const width = container.clientWidth
    const height = container.clientHeight
    const aspect = width / height
    const fovRad = (15 * Math.PI) / 180
    const visibleHeight = 2 * cameraDistance * Math.tan(fovRad / 2)
    const visibleWidth = visibleHeight * aspect
    const spreadY = visibleHeight / 2
    const spreadX = visibleWidth / 2

    const handleMouseMove = e => {
      const rect = container.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1)
      mouseRef.current = { x, y }
    }
    if (moveParticlesOnHover) {
      container.addEventListener('mousemove', handleMouseMove)
    }

    const count = particleCount
    const positions = new Float32Array(count * 3)
    const randoms = new Float32Array(count * 4)
    const colors = new Float32Array(count * 3)
    const palette = particleColors && particleColors.length > 0 ? particleColors : defaultColors

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 2
      const y = (Math.random() - 0.5) * 2
      const z = (Math.random() - 0.5) * 0.2
      positions.set([x, y, z], i * 3)
      randoms.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4)
      const col = hexToRgb(palette[Math.floor(Math.random() * palette.length)])
      colors.set(col, i * 3)
    }

    const geometry = new Geometry(gl, {
      position: { size: 3, data: positions },
      random: { size: 4, data: randoms },
      color: { size: 3, data: colors },
    })

    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        uTime: { value: 0 },
        uSpreadX: { value: spreadX },
        uSpreadY: { value: spreadY },
        uBaseSize: { value: particleBaseSize * dpr },
        uSizeRandomness: { value: sizeRandomness },
        uAlphaParticles: { value: alphaParticles ? 1 : 0 },
      },
      transparent: true,
      depthTest: false,
    })

    const particles = new Mesh(gl, { mode: gl.POINTS, geometry, program })

    let lastTime = performance.now()
    let elapsed = 0
    let lastRenderTime = 0
    const FPS = 15
    const FRAME_INTERVAL_MS = 1000 / FPS

    const update = t => {
      if (isPausedRef.current) return
      rafIdRef.current = requestAnimationFrame(update)
      const delta = t - lastTime
      lastTime = t
      // 通过 ref 读取 speed，避免 dep 变化重建 context
      elapsed += delta * speedRef.current

      if (t - lastRenderTime < FRAME_INTERVAL_MS) return
      lastRenderTime = t

      program.uniforms.uTime.value = elapsed * 0.001

      if (moveParticlesOnHoverRef.current) {
        particles.position.x = -mouseRef.current.x * particleHoverFactorRef.current
        particles.position.y = -mouseRef.current.y * particleHoverFactorRef.current
      } else {
        particles.position.x = 0
        particles.position.y = 0
      }

      if (!disableRotationRef.current) {
        particles.rotation.x = Math.sin(elapsed * 0.0002) * 0.1
        particles.rotation.y = Math.cos(elapsed * 0.0005) * 0.15
        particles.rotation.z += 0.01 * speedRef.current
      }

      renderer.render({ scene: particles, camera })
    }
    updateRef.current = update

    rafIdRef.current = requestAnimationFrame(update)

    return () => {
      window.removeEventListener('resize', resize)
      if (moveParticlesOnHover) {
        container.removeEventListener('mousemove', handleMouseMove)
      }
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      if (gl.canvas.isConnected) {
        try {
          gl.canvas.remove()
        } catch {
          /* 与 React Strict Mode / 并发卸载竞态时可能已不是子节点 */
        }
      }
      // 显式释放 WebGL 上下文，防止 context 数量超限
      const ext = gl.getExtension('WEBGL_lose_context')
      ext?.loseContext()
    }
  // speed / disableRotation / moveParticlesOnHover / particleHoverFactor 通过 ref 读取，
  // 不需要进 dep 数组，也不会因这些 prop 变化而重建 context
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [particleCount, colorsKey, alphaParticles, particleBaseSize, sizeRandomness, cameraDistance, dpr])

  return <div ref={containerRef} className={`particles-container ${className}`.trim()} />
})

export default Particles
