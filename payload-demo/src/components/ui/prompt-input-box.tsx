'use client'

import { ArrowUp, Check, Globe, Paperclip, Sparkles, Square, X } from 'lucide-react'
import React from 'react'

const cn = (...classes: (string | undefined | null | false)[]) =>
  classes.filter(Boolean).join(' ')

export type PromptLanguage = { code: string; label: string }
export type PromptTheme = { id: string; label: string }

export interface PromptInputBoxProps {
  /** Called when the user submits the brief. */
  onSend?: (message: string, files: File[]) => void
  isLoading?: boolean
  placeholder?: string
  className?: string
  /** Language picker shown as an in-box button. */
  languages?: PromptLanguage[]
  language?: string
  onLanguageChange?: (code: string) => void
  /** Optional theme picker shown as an in-box button. */
  themes?: PromptTheme[]
  themeId?: string
  onThemeChange?: (id: string) => void
  maxImages?: number
}

/**
 * Single-box prompt input: the user types their whole brief in one textarea and
 * the agent splits it into structured fields downstream. Image upload, language
 * and theme are surfaced as buttons inside the box (no external form fields).
 */
export const PromptInputBox = React.forwardRef<HTMLDivElement, PromptInputBoxProps>(
  (props, ref) => {
    const {
      onSend = () => {},
      isLoading = false,
      placeholder = 'Describe your business in one message…',
      className,
      languages = [],
      language,
      onLanguageChange,
      themes = [],
      themeId,
      onThemeChange,
      maxImages = 6,
    } = props

    const [input, setInput] = React.useState('')
    const [files, setFiles] = React.useState<File[]>([])
    const [previews, setPreviews] = React.useState<string[]>([])
    const [langOpen, setLangOpen] = React.useState(false)
    const [themeOpen, setThemeOpen] = React.useState(false)

    const textareaRef = React.useRef<HTMLTextAreaElement>(null)
    const uploadRef = React.useRef<HTMLInputElement>(null)
    const langRef = React.useRef<HTMLDivElement>(null)
    const themeRef = React.useRef<HTMLDivElement>(null)

    // Auto-grow the textarea up to a max height.
    React.useEffect(() => {
      const el = textareaRef.current
      if (!el) return
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 240)}px`
    }, [input])

    // Close the popovers when clicking outside.
    React.useEffect(() => {
      const onClick = (e: MouseEvent) => {
        if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false)
        if (themeRef.current && !themeRef.current.contains(e.target as Node)) setThemeOpen(false)
      }
      document.addEventListener('mousedown', onClick)
      return () => document.removeEventListener('mousedown', onClick)
    }, [])

    const addFiles = React.useCallback(
      (list: FileList | File[] | null) => {
        const incoming = Array.from(list ?? []).filter((f) => f.type.startsWith('image/'))
        if (incoming.length === 0) return
        setFiles((prev) => {
          const next = [...prev, ...incoming].slice(0, maxImages)
          setPreviews(next.map((f) => URL.createObjectURL(f)))
          return next
        })
      },
      [maxImages],
    )

    const removeFile = (index: number) => {
      setFiles((prev) => {
        const next = prev.filter((_, i) => i !== index)
        setPreviews(next.map((f) => URL.createObjectURL(f)))
        return next
      })
    }

    // Allow pasting an image straight into the box.
    React.useEffect(() => {
      const onPaste = (e: ClipboardEvent) => {
        const items = e.clipboardData?.items
        if (!items) return
        const imgs: File[] = []
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            const f = item.getAsFile()
            if (f) imgs.push(f)
          }
        }
        if (imgs.length) {
          e.preventDefault()
          addFiles(imgs)
        }
      }
      document.addEventListener('paste', onPaste)
      return () => document.removeEventListener('paste', onPaste)
    }, [addFiles])

    const hasContent = input.trim() !== '' || files.length > 0

    const submit = () => {
      if (!hasContent || isLoading) return
      onSend(input.trim(), files)
    }

    const onDrop = (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      addFiles(e.dataTransfer.files)
    }

    const currentLang = languages.find((l) => l.code === language)
    const currentTheme = themes.find((t) => t.id === themeId)

    return (
      <div
        ref={ref}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onDrop={onDrop}
        className={cn(
          'rounded-3xl border border-border bg-card p-3 shadow-sm transition-all duration-200 focus-within:border-primary/60 focus-within:shadow-md',
          isLoading && 'opacity-90',
          className,
        )}
      >
        {/* image thumbnails */}
        {previews.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {previews.map((src, i) => (
              <div key={i} className="group relative h-16 w-16 overflow-hidden rounded-xl border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`upload ${i + 1}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="absolute right-1 top-1 rounded-full bg-black/70 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="移除图片"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          rows={1}
          placeholder={placeholder}
          disabled={isLoading}
          className="min-h-[48px] w-full resize-none bg-transparent px-2 py-1.5 text-base leading-relaxed text-foreground placeholder:text-muted-foreground focus-visible:outline-none disabled:opacity-60"
        />

        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {/* upload */}
            <button
              type="button"
              onClick={() => uploadRef.current?.click()}
              disabled={isLoading || files.length >= maxImages}
              title="上传商品图（AI 看图设计）"
              className="flex h-9 items-center gap-1 rounded-full px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <Paperclip className="h-4 w-4" />
              <span className="hidden sm:inline">图片{files.length > 0 ? ` ${files.length}` : ''}</span>
            </button>
            <input
              ref={uploadRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files)
                if (e.target) e.target.value = ''
              }}
            />

            {/* language */}
            {languages.length > 0 && (
              <div ref={langRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setLangOpen((v) => !v)
                    setThemeOpen(false)
                  }}
                  disabled={isLoading}
                  className="flex h-9 items-center gap-1 rounded-full border border-border px-2.5 text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                  <Globe className="h-4 w-4" />
                  <span>{currentLang?.label ?? '语言'}</span>
                </button>
                {langOpen && (
                  <div className="absolute bottom-11 left-0 z-50 max-h-64 w-44 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-lg">
                    {languages.map((l) => (
                      <button
                        key={l.code}
                        type="button"
                        onClick={() => {
                          onLanguageChange?.(l.code)
                          setLangOpen(false)
                        }}
                        className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        {l.label}
                        {l.code === language && <Check className="h-4 w-4 text-primary" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* theme */}
            {themes.length > 0 && (
              <div ref={themeRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setThemeOpen((v) => !v)
                    setLangOpen(false)
                  }}
                  disabled={isLoading}
                  className="flex h-9 items-center gap-1 rounded-full border border-border px-2.5 text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                  <Sparkles className="h-4 w-4" />
                  <span className="max-w-[8rem] truncate">{currentTheme?.label ?? '主题'}</span>
                </button>
                {themeOpen && (
                  <div className="absolute bottom-11 left-0 z-50 max-h-64 w-56 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-lg">
                    {themes.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          onThemeChange?.(t.id)
                          setThemeOpen(false)
                        }}
                        className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        <span className="truncate">{t.label}</span>
                        {t.id === themeId && <Check className="h-4 w-4 shrink-0 text-primary" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* submit */}
          <button
            type="button"
            onClick={submit}
            disabled={!hasContent || isLoading}
            aria-label="生成独立站"
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-full transition-all',
              hasContent && !isLoading
                ? 'bg-primary text-primary-foreground hover:opacity-90'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {isLoading ? <Square className="h-4 w-4 animate-pulse" /> : <ArrowUp className="h-5 w-5" />}
          </button>
        </div>
      </div>
    )
  },
)
PromptInputBox.displayName = 'PromptInputBox'
