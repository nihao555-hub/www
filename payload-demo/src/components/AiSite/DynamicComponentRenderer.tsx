'use client'

/**
 * Route 2 — renders AI-/21st-authored JSX live, with a hard safety net.
 *
 * The component source is compiled once (memoized) via the JSX sandbox and
 * rendered inside an error boundary. If compilation fails, the component is not
 * a function, or it throws while rendering, we silently fall back to the
 * templated `fallback` node so a bad snippet can never blank the page.
 */
import * as React from 'react'
import { compileJsx, type CompiledComponent } from '@/lib/ai/jsx-sandbox'

type Props = {
  /** JSX/TSX source to compile and render */
  code: string
  /** extra values injected into the component's scope (theme, images, copy…) */
  scope?: Record<string, unknown>
  /** props passed to the compiled component */
  componentProps?: Record<string, unknown>
  /** rendered if compilation or runtime fails */
  fallback: React.ReactNode
}

class Boundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    /* swallow — the fallback is the recovery path */
  }
  render() {
    if (this.state.failed) return <>{this.props.fallback}</>
    return <>{this.props.children}</>
  }
}

export const DynamicComponentRenderer: React.FC<Props> = ({
  code,
  scope,
  componentProps,
  fallback,
}) => {
  const Compiled = React.useMemo<CompiledComponent | null>(() => {
    try {
      // Dynamic, sandbox-compiled component: it is intentionally created at
      // runtime from AI/21st source, so the static-components rule cannot apply.
      // eslint-disable-next-line react-hooks/static-components
      return compileJsx(code, scope)
    } catch {
      return null
    }
    // Recompile only when the source changes; scope is rebuilt per render but
    // is stable in practice for a given site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  if (!Compiled) return <>{fallback}</>

  return (
    <Boundary fallback={fallback}>
      {/* eslint-disable-next-line react-hooks/static-components */}
      <Compiled {...componentProps} />
    </Boundary>
  )
}

export default DynamicComponentRenderer
