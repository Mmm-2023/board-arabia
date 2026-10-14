import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import type { IncomingLink } from './incomingLink'
import { pushPlatform, routeFromPushAction } from './pushRegistration'

export async function pushPermissionGranted(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const status = await PushNotifications.checkPermissions()
    return status.receive === 'granted'
  } catch {
    return false
  }
}

/** The only place that asks the operating system. Call it after the member turns the control on. */
export async function askPushPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const status = await PushNotifications.requestPermissions()
    return status.receive === 'granted'
  } catch {
    return false
  }
}

export async function registerDevicePush(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    await PushNotifications.register()
    return true
  } catch {
    return false
  }
}

export async function unregisterDevicePush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await PushNotifications.unregister()
  } catch {
    // The server revoke still stands when the local unregister fails.
  }
}

export function currentPushPlatform(): 'ios' | 'android' | null {
  return pushPlatform(Capacitor.getPlatform())
}

export async function listenForPush(handlers: {
  onToken: (token: string) => void
  onRegistrationError: () => void
  onOpen: (link: IncomingLink) => void
}): Promise<() => Promise<void>> {
  if (!Capacitor.isNativePlatform()) return async () => undefined
  try {
    const handles = await Promise.all([
      PushNotifications.addListener('registration', (token) => {
        if (token?.value) handlers.onToken(token.value)
      }),
      PushNotifications.addListener('registrationError', () => {
        handlers.onRegistrationError()
      }),
      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        handlers.onOpen(routeFromPushAction(action))
      }),
    ])
    return async () => {
      await Promise.all(handles.map((handle) => handle.remove()))
    }
  } catch {
    return async () => undefined
  }
}
