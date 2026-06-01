// Meditrack Service Worker — handles web push notifications

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'Meditrack', body: event.data.text() }
  }

  const options = {
    body:    payload.body   ?? '',
    icon:    '/icon-192.png',
    badge:   '/icon-72.png',
    tag:     payload.tag    ?? 'meditrack-notif',
    data:    { url: payload.url ?? '/dashboard' },
    vibrate: [200, 100, 200],
    requireInteraction: false,
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'Meditrack', options)
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/dashboard'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
