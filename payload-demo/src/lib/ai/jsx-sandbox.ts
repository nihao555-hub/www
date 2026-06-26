/**
 * Route 2 — real JSX rendering.
 *
 * Compiles a self-contained React component written in JSX/TSX (authored by the
 * AI or pulled from 21st.dev) into a live React component at runtime. This is
 * what makes generated sites stop looking like one shared template: instead of
 * only filling a fixed renderer, we can execute bespoke component code.
 *
 * Safety model (best-effort, not a hardened sandbox):
 *  - `import` / `export` statements are stripped; the code cannot pull in
 *    arbitrary modules.
 *  - The compiled function body runs inside `with(scope)`, where `scope` is a
 *    Proxy that resolves every free identifier. Known-safe values (React, hooks,
 *    motion, lucide icons, `cn`, a handful of pure globals) are returned;
 *    unknown capitalized identifiers resolve to a harmless pass-through
 *    component; everything else (window, document, fetch, eval, process, …)
 *    resolves to `undefined`, so attempts to touch the host environment throw
 *    and are caught by the surrounding error boundary.
 *  - Any compile/runtime error falls back to the templated section, so a bad
 *    component never blanks the page.
 */
import { transform } from 'sucrase'
import * as React from 'react'
import * as Lucide from 'lucide-react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { motion, AnimatePresence } from 'motion/react'

export type CompiledComponent = React.ComponentType<Record<string, unknown>>

function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** A harmless stand-in for unresolved capitalized identifiers (unknown imports). */
const Passthrough: React.FC<{ children?: React.ReactNode }> = ({ children }) =>
  React.createElement(React.Fragment, null, children)
Passthrough.displayName = 'SandboxPassthrough'

/** Pure, side-effect-free globals the component is allowed to see. */
const SAFE_GLOBALS: Record<string, unknown> = {
  Math,
  Date,
  JSON,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Symbol,
  Map,
  Set,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  encodeURIComponent,
  decodeURIComponent,
  undefined,
  NaN,
  Infinity,
  console: { log: () => {}, warn: () => {}, error: () => {} },
}

const REACT_BINDINGS: Record<string, unknown> = {
  React,
  Fragment: React.Fragment,
  useState: React.useState,
  useEffect: React.useEffect,
  useLayoutEffect: React.useEffect,
  useRef: React.useRef,
  useMemo: React.useMemo,
  useCallback: React.useCallback,
  useContext: React.useContext,
  useReducer: React.useReducer,
  useId: React.useId,
}

function buildScope(extra: Record<string, unknown>): Record<string, unknown> {
  const base: Record<string, unknown> = {
    ...SAFE_GLOBALS,
    ...REACT_BINDINGS,
    cn,
    clsx,
    twMerge,
    motion,
    AnimatePresence,
    ...extra,
  }

  return new Proxy(base, {
    has() {
      // Claim every identifier so `with(scope)` intercepts all free lookups
      // instead of leaking to the real global scope.
      return true
    },
    get(target, prop: string | symbol) {
      if (typeof prop === 'symbol') return undefined
      if (prop in target) return target[prop]
      // lucide-react icons are referenced by capitalized name (e.g. <Check />)
      if (prop in Lucide) return (Lucide as Record<string, unknown>)[prop]
      // Unknown capitalized identifier -> assume it's a component import we
      // stripped; render its children rather than crashing.
      if (typeof prop === 'string' && /^[A-Z]/.test(prop)) return Passthrough
      // Everything else (window, document, fetch, eval, process, ...) is hidden.
      return undefined
    },
  })
}

/**
 * Remove module syntax (imports/exports) and capture the name of the default /
 * primary exported component so we know what to return.
 */
function stripModuleSyntax(src: string): { code: string; returnExpr: string } {
  let defaultName = ''
  let code = src

  // Drop all import statements.
  code = code.replace(/^\s*import\s+[^\n;]*;?\s*$/gm, '')

  // export default function Foo(...) -> function Foo(...)
  code = code.replace(/export\s+default\s+function\s+([A-Za-z0-9_$]+)/, (_m, name) => {
    defaultName = name
    return `function ${name}`
  })
  // export default class Foo -> class Foo
  code = code.replace(/export\s+default\s+class\s+([A-Za-z0-9_$]+)/, (_m, name) => {
    defaultName = name
    return `class ${name}`
  })
  // export default <expr>;  -> const __default__ = <expr>;
  code = code.replace(/export\s+default\s+/, () => {
    if (defaultName) return ''
    defaultName = '__default__'
    return 'const __default__ = '
  })
  // export const/let/var/function/class -> strip the `export ` keyword
  code = code.replace(/export\s+(const|let|var|function|class)\s/g, '$1 ')
  // export { ... } (possibly with `from`) -> drop entirely
  code = code.replace(/export\s*\{[^}]*\}\s*(from\s+['"][^'"]+['"])?;?/g, '')

  // Collect top-level capitalized declarations as fallback return candidates.
  const declNames: string[] = []
  const declRe = /(?:function|const|let|var|class)\s+([A-Z][A-Za-z0-9_$]*)/g
  let match: RegExpExecArray | null
  while ((match = declRe.exec(code)) !== null) declNames.push(match[1])

  const candidate =
    defaultName ||
    // Prefer a name that looks like the main component (Hero/Section/Page/App/…)
    declNames.find((n) => /(Hero|Section|Page|App|Main|Component|Block)$/.test(n)) ||
    declNames[declNames.length - 1] ||
    ''

  const returnExpr = candidate
    ? `return (typeof ${candidate} !== 'undefined' ? ${candidate} : undefined);`
    : `return undefined;`

  return { code, returnExpr }
}

/**
 * Compile a JSX/TSX component source string into a live React component.
 * Returns `null` if the code is empty or no component could be located.
 * Throws on syntax errors (the caller's error boundary handles it).
 */
export function compileJsx(
  source: string,
  scopeExtra: Record<string, unknown> = {},
): CompiledComponent | null {
  if (!source || !source.trim()) return null

  const { code, returnExpr } = stripModuleSyntax(source)

  const transformed = transform(code, {
    transforms: ['jsx', 'typescript'],
    jsxRuntime: 'classic',
    production: true,
  }).code

  const scope = buildScope(scopeExtra)

  // Run the component body inside `with(__scope__)` so every free identifier is
  // intercepted by the scope Proxy rather than reaching the real globals.
  const factoryBody = `with(__scope__){\n${transformed}\n;${returnExpr}\n}`
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const factory = new Function('__scope__', factoryBody) as (proxy: unknown) => unknown

  const Comp = factory(scope)
  if (typeof Comp !== 'function') return null
  return Comp as CompiledComponent
}
