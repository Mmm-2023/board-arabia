import type { ReactNode } from 'react'
import type { MarketingPath } from '../content/seo'
import { Footer } from './Footer'
import { Nav } from './Nav'
import { Seo } from './Seo'

export function MarketingLayout({
  path,
  children,
}: {
  path: MarketingPath
  children: ReactNode
}) {
  return (
    <>
      <Seo path={path} />
      <Nav />
      <main className="min-h-dvh bg-pearl pt-16 md:pt-20">{children}</main>
      <Footer />
    </>
  )
}
