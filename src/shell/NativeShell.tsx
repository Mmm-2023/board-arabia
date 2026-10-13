import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core'
import { THEME_COLOR } from '../content/seo'
import { androidBackAction, classifyIncomingUrl, type InAppLink } from './incomingLink'

const BRAND = THEME_COLOR

/** Native-only chrome: deep links, the Android back button, external links, safe areas. */
export function NativeShell() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    const root = document.documentElement
    root.classList.add('ba-native')
    let lastUrl = ''

    function openInApp(link: InAppLink) {
      navigate({ pathname: link.path, search: link.search, hash: link.hash })
    }

    function openUrl(raw: string) {
      if (!raw || raw === lastUrl) return
      const decision = classifyIncomingUrl(raw)
      if (decision.kind === 'in-app') {
        lastUrl = raw
        openInApp(decision)
        return
      }
      if (decision.kind === 'external') {
        lastUrl = raw
        void Browser.open({ url: decision.href, toolbarColor: BRAND })
      }
    }

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest('a')
      if (!anchor) return
      const href = anchor.href
      if (!href) return
      const decision = classifyIncomingUrl(href)
      if (decision.kind === 'external') {
        event.preventDefault()
        void Browser.open({ url: decision.href, toolbarColor: BRAND })
        return
      }
      if (decision.kind !== 'in-app') return
      const here = window.location
      if (anchor.host === here.host) return
      event.preventDefault()
      openInApp(decision)
    }

    const previousOpen = window.open.bind(window)
    window.open = (url?: string | URL, target?: string, features?: string) => {
      if (url == null || url === '') return previousOpen(url, target, features)
      const href = new URL(String(url), window.location.href).toString()
      const decision = classifyIncomingUrl(href)
      if (decision.kind === 'external') {
        void Browser.open({ url: decision.href, toolbarColor: BRAND })
        return null
      }
      if (decision.kind === 'in-app') {
        openInApp(decision)
        return null
      }
      return previousOpen(url, target, features)
    }

    document.addEventListener('click', onClick)
    void SystemBars.setStyle({ style: SystemBarsStyle.Dark })

    const listeners = Promise.all([
      App.addListener('appUrlOpen', (event) => {
        openUrl(event.url)
      }),
      App.addListener('backButton', ({ canGoBack }) => {
        if (androidBackAction(canGoBack) === 'back') {
          window.history.back()
          return
        }
        void App.exitApp()
      }),
    ])

    void App.getLaunchUrl().then((launch) => {
      if (launch?.url) openUrl(launch.url)
    })

    return () => {
      root.classList.remove('ba-native')
      document.removeEventListener('click', onClick)
      window.open = previousOpen
      void listeners.then((handles) => {
        for (const handle of handles) void handle.remove()
      })
    }
  }, [navigate])

  return null
}
