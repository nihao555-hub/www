import type { Metadata } from 'next'

import React from 'react'

import { GenerateForm } from './GenerateForm'

export const metadata: Metadata = {
  title: 'AI 独立站生成器',
  description: '上传商品图 + 简单信息，AI 自主设计并生成一个现代独立站页面。',
}

export default function GeneratePage() {
  return (
    <div className="container py-12">
      <div className="mx-auto mb-10 max-w-3xl text-center">
        <h1 className="mb-3 text-3xl font-bold md:text-4xl">AI 独立站生成器</h1>
        <p className="text-muted-foreground">
          上传商家的商品图和简单信息，AI（gpt-5.5 视觉）会读懂商品并自主设计版式、配色、文案与版块，
          从 30+ 套风格主题中自动选择，结合 21st.dev 组件灵感，生成一个 Next.js + Payload
          的现代独立站。生成过程实时可见，完成后可在后台自行修改并切换多语言。
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          注意：需先登录
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/admin" className="underline mx-1">
            后台
          </a>
          再生成。
        </p>
      </div>
      <GenerateForm />
    </div>
  )
}
