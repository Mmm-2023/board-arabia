import type { ReactNode } from 'react'
import { usePageTitle } from '../lib/usePageTitle'
import { Footer } from './Footer'
import { Nav } from './Nav'

export function MarketingLayout({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  usePageTitle(title)

  return (
    <>
      <Nav />
      <main className="min-h-dvh bg-pearl pt-16 md:pt-20">{children}</main>
      <Footer />
    </>
  )
}
