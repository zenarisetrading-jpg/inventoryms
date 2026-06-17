import React, { useEffect, useState } from 'react'
import { motion, useSpring } from 'framer-motion'

export function CursorSpotlight() {
  const [isVisible, setIsVisible] = useState(false)
  
  // Use springs for smooth following
  const springConfig = { damping: 25, stiffness: 200, mass: 0.5 }
  const x = useSpring(-500, springConfig)
  const y = useSpring(-500, springConfig)

  useEffect(() => {
    // Check if the user prefers reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // Check if it's a mobile/touch device
    const isMobile = window.matchMedia('(hover: none) and (pointer: coarse)').matches

    if (prefersReducedMotion || isMobile) {
      return
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!isVisible) setIsVisible(true)
      // Offset by half of the 250px size to center it
      x.set(e.clientX - 125)
      y.set(e.clientY - 125)
    }

    const handleMouseLeave = () => {
      setIsVisible(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    document.documentElement.addEventListener('mouseleave', handleMouseLeave)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      document.documentElement.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [x, y, isVisible])

  return (
    <motion.div
      style={{
        x,
        y,
        opacity: isVisible ? 1 : 0,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: isVisible ? 1 : 0 }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
      className="pointer-events-none fixed top-0 left-0 z-50"
    >
      <div 
        className="w-[250px] h-[250px] rounded-full"
        style={{
          // Spotlight gradient
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, rgba(59, 130, 246, 0.05) 50%, transparent 100%)',
          // Micro-blur to simulate glass thickness without ruining readability
          backdropFilter: 'blur(0.5px) contrast(1.05) brightness(1.2) saturate(1.2)',
          WebkitBackdropFilter: 'blur(0.5px) contrast(1.05) brightness(1.2) saturate(1.2)',
        }}
      />
    </motion.div>
  )
}
