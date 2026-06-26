import React from 'react'

import '../(frontend)/globals.css'

/**
 * Standalone root layout for AI-generated sites. It deliberately does NOT render
 * the Payload demo Header/Footer so each generated site owns its full chrome.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  )
}
