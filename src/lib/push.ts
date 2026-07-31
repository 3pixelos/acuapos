import { supabase } from './supabase'

/* Web Push for admin devices. iOS (16.4+) only delivers push to a PWA that
 * was added to the home screen and opened from that icon — never a plain
 * Safari tab. The permission prompt must be triggered by a user gesture,
 * hence the explicit "enable" button in the admin UI. */

// VAPID PUBLIC key — safe to ship in the client. The matching PRIVATE key
// lives only in the serverless function's env (VAPID_PRIVATE_KEY).
// TODO(client): generate a NEW VAPID keypair for Acua (npx web-push
// generate-vapid-keys) and set the private key in the notify function's env.
const VAPID_PUBLIC =
  'BMvpHwJ2oJcCX0DCNy7lbEvi7IHokqqLDFpA8uYwVGmBLFnDM0s6lDtpI8JtXuHYxTxW5iTff8TNL8-r3lP8jIA'

// Absolute so it resolves from the Tauri desktop app too (not just the web).
// TODO(client): point this at Acua's own deployed notify endpoint.
const NOTIFY_ENDPOINT = 'https://acua-pos.vercel.app/api/notify'

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** True when launched from the home-screen icon (required by iOS for push). */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

/** Rough iOS detection, for the "add to home screen" hint. */
export function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  if (!pushSupported()) return 'unsupported'
  return Notification.permission
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

let swReg: ServiceWorkerRegistration | null = null
export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  if (swReg) return swReg
  swReg = await navigator.serviceWorker.register('/sw.js')
  return swReg
}

export type EnableResult = 'ok' | 'denied' | 'unsupported' | 'not-standalone' | 'error'

/** Ask permission, subscribe, and store the subscription against the admin.
 * MUST be called from a user gesture (button click) for iOS. */
export async function enablePush(staffId: string): Promise<EnableResult> {
  if (!pushSupported()) return 'unsupported'
  // iOS requires the home-screen PWA; a Safari tab can't subscribe.
  if (isIOS() && !isStandalone()) return 'not-standalone'
  try {
    const reg = await ensureServiceWorker()
    if (!reg) return 'unsupported'
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return 'denied'
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      })
    }
    const json = sub.toJSON()
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        staff_id: staffId,
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
      },
      { onConflict: 'endpoint' },
    )
    if (error) {
      console.error('[push] store failed:', error)
      return 'error'
    }
    return 'ok'
  } catch (e) {
    console.error('[push] enable failed:', e)
    return 'error'
  }
}

/** Fire a push to every admin device. Best-effort and never blocks the
 * caller — the action (cancel / report request) already succeeded on its
 * own; a failed notification must not undo it. Runs from whichever device
 * triggered the action. */
export function notifyAdmins(title: string, body: string, tag?: string): void {
  void fetch(NOTIFY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body, tag }),
    keepalive: true,
  }).catch(() => {})
}
