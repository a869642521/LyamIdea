'use client'
import { useEffect, useRef } from 'react'

interface SwimmingParticlesProps {
  className?: string
}

/** 原 Leva「粒子参数」默认值（调试面板已移除） */
const SWIMMING_PARAMS = {
  particleNum: 1000,
  particleRadiusMin: 1,
  particleRadiusMax: 2,
  trailAlpha: 0.05,
  radSpeed: 0.01,
  sSpeed: 0.001,
  respawnThreshold: 5,
  colorRMin: 0,
  colorRMax: 60,
  colorGMin: 150,
  colorGMax: 255,
  colorBMin: 180,
  colorBMax: 255,
  autoColorChange: true,
  colorChangeIntervalMin: 1000,
  colorChangeIntervalMax: 5000,
} as const

export default function SwimmingParticles({ className = '' }: SwimmingParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvasOrNull = canvasRef.current
    if (!canvasOrNull) return
    const canvas: HTMLCanvasElement = canvasOrNull
    const ctxOrNull = canvas.getContext('2d')
    if (!ctxOrNull) return
    const ctx = ctxOrNull

    const p = SWIMMING_PARAMS

    let animId: number
    let W = (canvas.width = canvas.offsetWidth)
    let H = (canvas.height = canvas.offsetHeight)
    let mouseX = W / 2
    let mouseY = H / 2
    let flg = true

    function rand(min: number, max: number) {
      return Math.floor(Math.random() * (max - min + 1) + min)
    }

    interface Color {
      r: number
      g: number
      b: number
    }

    class Particle {
      x: number
      y: number
      x1: number
      y1: number
      r: number
      s: number
      a: number
      rad: number
      z: number
      v: { x: number; y: number }
      c: Color

      constructor(x: number, y: number, r: number) {
        this.x = x
        this.y = y
        this.x1 = x
        this.y1 = y
        this.r = r
        this.s = Math.random()
        this.a = rand(0, 360)
        this.rad = (this.a * Math.PI) / 180
        this.z = Math.random() + 1
        this.v = { x: 0, y: 0 }
        this.c = {
          r: rand(p.colorRMin, p.colorRMax),
          g: rand(p.colorGMin, p.colorGMax),
          b: rand(p.colorBMin, p.colorBMax),
        }
      }

      updatePosition() {
        if (!flg) {
          const dx = this.x - this.x1
          const dy = this.y - this.y1
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          this.v.x = (dx / dist) * (1 + this.s)
          this.v.y = (dy / dist) * (1 + this.s)
          this.x = Math.sin(this.rad) * 2 + this.x - this.v.x
          this.y = Math.cos(this.rad) * 2 + this.y - this.v.y
        } else {
          const dx = this.x - mouseX
          const dy = this.y - mouseY
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          this.v.x = (dx / dist) * (1 + this.s)
          this.v.y = (dy / dist) * (1 + this.s)
          this.x = Math.sin(this.rad) * this.z + this.x - this.v.x
          this.y = Math.cos(this.rad) * this.z + this.y - this.v.y
          if (
            Math.abs(this.x - mouseX) < p.respawnThreshold &&
            Math.abs(this.y - mouseY) < p.respawnThreshold
          ) {
            this.x = rand(0, W)
            this.y = rand(0, H)
            this.s = Math.random()
          }
        }
      }

      updateParams() {
        this.s += p.sSpeed
        this.rad += p.radSpeed
      }

      draw() {
        ctx.save()
        ctx.beginPath()
        ctx.globalCompositeOperation = 'lighter'
        ctx.fillStyle = `rgb(${this.c.r}, ${this.c.g}, ${this.c.b})`
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2, false)
        ctx.fill()
        ctx.restore()
      }

      render() {
        this.updatePosition()
        this.updateParams()
        this.draw()
      }

      resize() {
        const rMin = p.particleRadiusMin
        const rMax = p.particleRadiusMax
        this.x = rand(0, W)
        this.y = rand(0, H)
        this.x1 = this.x
        this.y1 = this.y
        this.r = rMin + Math.random() * (rMax - rMin)
      }
    }

    const count = W < 768 ? Math.min(500, p.particleNum) : p.particleNum
    const rMin = p.particleRadiusMin
    const rMax = p.particleRadiusMax
    const particles: Particle[] = []
    for (let i = 0; i < count; i++) {
      particles.push(new Particle(rand(0, W), rand(0, H), rMin + Math.random() * (rMax - rMin)))
    }

    let colorTimer: ReturnType<typeof setTimeout>
    function changeColor() {
      if (!p.autoColorChange) {
        colorTimer = setTimeout(changeColor, 2000)
        return
      }
      const time = rand(p.colorChangeIntervalMin, p.colorChangeIntervalMax)
      const r = rand(p.colorRMin, p.colorRMax)
      const g = rand(p.colorGMin, p.colorGMax)
      const b = rand(p.colorBMin, p.colorBMax)
      for (const pt of particles) {
        pt.c = { r, g, b }
      }
      colorTimer = setTimeout(changeColor, time)
    }
    changeColor()

    function renderFrame() {
      ctx.globalCompositeOperation = 'darken'
      ctx.globalAlpha = p.trailAlpha
      ctx.fillStyle = 'rgb(0,0,0)'
      ctx.fillRect(0, 0, W, H)
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
      for (const pt of particles) pt.render()
      animId = requestAnimationFrame(renderFrame)
    }
    renderFrame()

    function onResize() {
      W = canvas.width = canvas.offsetWidth
      H = canvas.height = canvas.offsetHeight
      for (const pt of particles) pt.resize()
    }

    function onMouseMove(e: MouseEvent) {
      const rect = canvas.getBoundingClientRect()
      mouseX = e.clientX - rect.left
      mouseY = e.clientY - rect.top
    }

    function onClick() {
      flg = !flg
    }

    window.addEventListener('resize', onResize)
    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('click', onClick)

    return () => {
      cancelAnimationFrame(animId)
      clearTimeout(colorTimer)
      window.removeEventListener('resize', onResize)
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('click', onClick)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full block ${className}`}
      style={{ background: '#000000' }}
    />
  )
}
