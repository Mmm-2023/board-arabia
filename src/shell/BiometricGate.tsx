import { useEffect, useState, type ComponentType } from 'react'
import { Capacitor } from '@capacitor/core'

/** Loads the native gate only inside the app. The website never downloads it. */
export function BiometricGate() {
  const [Gate, setGate] = useState<ComponentType | null>(null)

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let cancelled = false
    void import('./BiometricGateNative').then((mod) => {
      if (!cancelled) setGate(() => mod.BiometricGateNative)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!Gate) return null
  return <Gate />
}
