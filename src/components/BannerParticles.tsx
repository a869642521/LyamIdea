'use client'

import { useRef, useEffect } from 'react'

// 每次鼠标移动时从鼠标位置发射一批新粒子
const BURST_COUNT = 5       // 每次触发发射数量，略少更轻盈
const MAX_PARTICLES = 200   // 最大粒子数
const WARM_COLORS = ['255,220,150', '255,240,200', '255,255,255']  // 白/金/琥珀

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  opacity: number
  life: number
  decay: number
  color: string  // rgb 字符串，用于 rgba(color, alpha)
}

function spawnBurst(x: number, y: number, particles: Particle[]) {
  for (let i = 0; i < BURST_COUNT; i++) {
    // 略偏向上方，更有烟花感
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2
    const speed = 2 + Math.random() * 2
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 1.5 + Math.random() * 1.5,
      opacity: 0.7 + Math.random() * 0.3,
      life: 1,
      decay: 0.008 + Math.random() * 0.007,
      color: WARM_COLORS[Math.floor(Math.random() * WARM_COLORS.length)],
    })
  }
  if (particles.length > MAX_PARTICLES) {
    particles.splice(0, particles.length - MAX_PARTICLES)
  }
}

export default function BannerParticles() {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const mouseRef = useRef({ x: 0, y: 0, inside: false, prevX: 0, prevY: 0 })
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const wrapper = wrapperRef.current
    const canvas = canvasRef.current
    if (!wrapper || !canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = 0
    let h = 0

    function resize() {
      w = wrapper!.clientWidth
      h = wrapper!.clientHeight
      canvas!.width = w
      canvas!.height = h
    }

    function draw() {
      if (!ctx || w <= 0 || h <= 0) {
        rafRef.current = requestAnimationFrame(draw)
        return
      }

      ctx.clearRect(0, 0, w, h)
      const particles = particlesRef.current

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.life -= p.decay
        if (p.life <= 0) {
          particles.splice(i, 1)
          continue
        }

        // 物理：更轻重力 + 更平滑阻力
        p.vy += 0.02
        p.vx *= 0.99
        p.vy *= 0.99
        p.x += p.vx
        p.y += p.vy

        const alpha = p.life * p.opacity
        const r = p.size * (0.5 + p.life * 1.5)

        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r)
        grad.addColorStop(0, `rgba(${p.color},${alpha})`)
        grad.addColorStop(0.3, `rgba(${p.color},${alpha * 0.7})`)
        grad.addColorStop(1, 'transparent')

        ctx.beginPath()
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
        ctx.fillStyle = grad
        ctx.fill()
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    function onMouseMove(e: MouseEvent) {
      if (!wrapper) return
      const rect = wrapper.getBoundingClientRect()
      const inside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom

      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      // 只在 banner 内发射，移动距离超过阈值才触发
      if (inside) {
        const dx = x - mouseRef.current.prevX
        const dy = y - mouseRef.current.prevY
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > 15) {
          spawnBurst(x, y, particlesRef.current)
          mouseRef.current.prevX = x
          mouseRef.current.prevY = y
        }
      }

      mouseRef.current.x = x
      mouseRef.current.y = y
      mouseRef.current.inside = inside
    }

    resize()
    rafRef.current = requestAnimationFrame(draw)

    window.addEventListener('resize', resize)
    document.addEventListener('mousemove', onMouseMove)

    return () => {
      window.removeEventListener('resize', resize)
      document.removeEventListener('mousemove', onMouseMove)
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <div
      ref={wrapperRef}
      className="absolute inset-0 z-[1] pointer-events-none"
      aria-hidden
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        width={0}
        height={0}
      />
    </div>
  )
}
