import React, { useEffect, useRef } from 'react'

interface OOBEBackgroundProps {
  primaryColor: string
  mode: 'light' | 'dark'
}

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16)
  }
}

export const OOBEBackground: React.FC<OOBEBackgroundProps> = ({ primaryColor, mode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const rgb = hexToRgb(primaryColor)

    const isDark = mode === 'dark'

    const bgColor = isDark ? '#0a1628' : '#e8f4fc'
    const transparentColor = isDark ? 'rgba(10, 22, 40, 0)' : 'rgba(232, 244, 252, 0)'

    const blobs: {
      x: number
      y: number
      radius: number
      vx: number
      vy: number
      color: string
      phase: number
    }[] = []

    const baseColors = isDark
      ? [
          `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35)`,
          `rgba(${Math.min(255, rgb.r + 20)}, ${Math.min(255, rgb.g + 30)}, ${Math.min(255, rgb.b + 40)}, 0.30)`,
          `rgba(${Math.max(0, rgb.r - 10)}, ${Math.max(0, rgb.g - 20)}, ${Math.max(0, rgb.b - 30)}, 0.30)`,
          `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`,
          `rgba(${Math.min(255, rgb.r + 40)}, ${Math.min(255, rgb.g + 50)}, ${rgb.b}, 0.28)`
        ]
      : [
          `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.18)`,
          `rgba(${Math.min(255, rgb.r + 30)}, ${Math.min(255, rgb.g + 40)}, ${Math.min(255, rgb.b + 50)}, 0.15)`,
          `rgba(${Math.max(0, rgb.r - 20)}, ${Math.max(0, rgb.g - 30)}, ${Math.max(0, rgb.b - 40)}, 0.12)`,
          `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.10)`,
          `rgba(${Math.min(255, rgb.r + 50)}, ${Math.min(255, rgb.g + 60)}, ${rgb.b}, 0.14)`
        ]

    for (let i = 0; i < 5; i++) {
      blobs.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: 150 + Math.random() * 200,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        color: baseColors[i % baseColors.length],
        phase: Math.random() * Math.PI * 2
      })
    }

    let time = 0

    const animate = () => {
      time += 0.008

      ctx.fillStyle = bgColor
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      blobs.forEach((blob, i) => {
        const wobbleX = Math.sin(time + blob.phase) * 30
        const wobbleY = Math.cos(time * 0.7 + blob.phase) * 30

        blob.x += blob.vx + Math.sin(time * 0.5 + i) * 0.1
        blob.y += blob.vy + Math.cos(time * 0.5 + i) * 0.1

        if (blob.x < -blob.radius) blob.x = canvas.width + blob.radius
        if (blob.x > canvas.width + blob.radius) blob.x = -blob.radius
        if (blob.y < -blob.radius) blob.y = canvas.height + blob.radius
        if (blob.y > canvas.height + blob.radius) blob.y = -blob.radius

        const gradient = ctx.createRadialGradient(
          blob.x + wobbleX,
          blob.y + wobbleY,
          0,
          blob.x + wobbleX,
          blob.y + wobbleY,
          blob.radius
        )
        gradient.addColorStop(0, blob.color)
        gradient.addColorStop(1, transparentColor)

        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(blob.x + wobbleX, blob.y + wobbleY, blob.radius, 0, Math.PI * 2)
        ctx.fill()
      })

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animationRef.current)
    }
  }, [primaryColor, mode])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        filter: 'blur(40px)'
      }}
    />
  )
}
