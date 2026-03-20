import { useState, useEffect } from "react"

export type Breakpoint = "xs" | "sm" | "md" | "lg" | "xl" | "xxl"

export interface Breakpoints {
  xs: number
  sm: number
  md: number
  lg: number
  xl: number
  xxl: number
}

const defaultBreakpoints: Breakpoints = {
  xs: 480,
  sm: 576,
  md: 768,
  lg: 992,
  xl: 1200,
  xxl: 1600,
}

export function useResponsive(customBreakpoints?: Partial<Breakpoints>): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>("lg")
  const breakpoints = { ...defaultBreakpoints, ...customBreakpoints }

  useEffect(() => {
    const updateBreakpoint = () => {
      const width = window.innerWidth

      if (width < breakpoints.xs) {
        setBreakpoint("xs")
      } else if (width < breakpoints.sm) {
        setBreakpoint("sm")
      } else if (width < breakpoints.md) {
        setBreakpoint("md")
      } else if (width < breakpoints.lg) {
        setBreakpoint("lg")
      } else if (width < breakpoints.xl) {
        setBreakpoint("xl")
      } else {
        setBreakpoint("xxl")
      }
    }

    updateBreakpoint()
    window.addEventListener("resize", updateBreakpoint)
    return () => window.removeEventListener("resize", updateBreakpoint)
  }, [breakpoints])

  return breakpoint
}

export function useScreenSize() {
  const [screenSize, setScreenSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  })

  useEffect(() => {
    const handleResize = () => {
      setScreenSize({
        width: window.innerWidth,
        height: window.innerHeight,
      })
    }

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  return screenSize
}

export function useIsMobile() {
  const breakpoint = useResponsive()
  return breakpoint === "xs" || breakpoint === "sm"
}

export function useIsTablet() {
  const breakpoint = useResponsive()
  return breakpoint === "md"
}

export function useIsDesktop() {
  const breakpoint = useResponsive()
  return breakpoint === "lg" || breakpoint === "xl" || breakpoint === "xxl"
}
