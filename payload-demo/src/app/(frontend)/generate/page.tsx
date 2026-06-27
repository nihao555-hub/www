import type { Metadata } from 'next'

import React from 'react'

import { landingTemplateCatalog } from '@/lib/ai/site-templates'
import { GenerateForm } from './GenerateForm'

export const metadata: Metadata = {
  title: 'AI 独立站生成器',
  description: '上传商品图 + 简单信息，AI 自主设计并生成一个现代独立站页面。',
}

export default function GeneratePage() {
  return <GenerateForm templates={landingTemplateCatalog()} />
}
