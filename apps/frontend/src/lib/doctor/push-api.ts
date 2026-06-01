const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001/api/v1'

async function apiFetch(path: string, token: string, options?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
  })
  return res.json()
}

export async function getVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch(`${API}/push/vapid-public-key`)
    const json = await res.json() as { success: boolean; data?: { public_key: string } }
    return json.success ? (json.data?.public_key ?? null) : null
  } catch { return null }
}

export async function subscribeToPush(token: string): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false
  }

  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return false

    const vapidKey = await getVapidPublicKey()
    if (!vapidKey) return false

    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    await navigator.serviceWorker.ready

    // Convert VAPID public key from base64 to Uint8Array
    const keyBytes = urlBase64ToUint8Array(vapidKey)

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes.buffer as ArrayBuffer,
    })

    const subJson = sub.toJSON()
    await apiFetch('/push/subscribe', token, {
      method: 'POST',
      body: JSON.stringify({
        endpoint: sub.endpoint,
        keys: {
          p256dh: subJson.keys?.p256dh,
          auth:   subJson.keys?.auth,
        },
      }),
    })

    return true
  } catch (err) {
    console.warn('[push] subscribe error:', err)
    return false
  }
}

export async function unsubscribeFromPush(token: string): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js')
    if (!reg) return
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return
    const endpoint = sub.endpoint
    await sub.unsubscribe()
    await apiFetch('/push/unsubscribe', token, { method: 'POST', body: JSON.stringify({ endpoint }) })
  } catch (err) {
    console.warn('[push] unsubscribe error:', err)
  }
}

export async function isPushSubscribed(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js')
    if (!reg) return false
    const sub = await reg.pushManager.getSubscription()
    return sub !== null
  } catch { return false }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from(Array.from(raw).map(c => c.charCodeAt(0)))
}
