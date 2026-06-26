import React from 'react'

import { getTheme, themeCssVars } from '@/lib/ai/themes'

/**
 * Wraps page content and applies the selected theme preset as scoped CSS
 * variables (palette, radius) plus loads the theme's Google fonts. Because the
 * standard blocks read these same `--primary` / `--background` / `--radius`
 * tokens, the whole page re-skins without touching block code.
 */
export const SiteTheme: React.FC<{
  themeId?: string | null
  children: React.ReactNode
}> = ({ themeId, children }) => {
  const theme = getTheme(themeId)
  const vars = themeCssVars(theme) as React.CSSProperties

  const families = Array.from(new Set([theme.fonts.heading, theme.fonts.body]))
  const fontParam = families
    .map((f) => `family=${encodeURIComponent(f)}:wght@400;500;600;700;800`)
    .join('&')
  const googleHref = `https://fonts.googleapis.com/css2?${fontParam}&display=swap`

  return (
    <div data-site-theme={theme.id} style={vars}>
      <link rel="stylesheet" href={googleHref} />
      <style
        // Scope font families to this theme wrapper only.
        dangerouslySetInnerHTML={{
          __html: `
[data-site-theme="${theme.id}"] { font-family: "${theme.fonts.body}", system-ui, sans-serif; }
[data-site-theme="${theme.id}"] h1,
[data-site-theme="${theme.id}"] h2,
[data-site-theme="${theme.id}"] h3,
[data-site-theme="${theme.id}"] h4 { font-family: "${theme.fonts.heading}", system-ui, sans-serif; }
`,
        }}
      />
      {children}
    </div>
  )
}
