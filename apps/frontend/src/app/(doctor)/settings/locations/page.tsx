'use client'

import { Fragment, useEffect, useState, useCallback, useRef, type CSSProperties } from 'react'
import {
  MapPin, Plus, Pencil, Power, Building2,
  Loader2, CheckCircle2, AlertCircle, X, ExternalLink, Navigation, Map,
} from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import {
  listLocations, createLocation, updateLocation, deactivateLocation,
  type Location, type CreateLocationData,
} from '@/lib/doctor/locations-api'
import {
  ClinicalButton, ClinicalHeader, ClinicalPage, LoadingState, MTPanel,
} from '@/components/doctor/clinical-ui'

type GooglePlaceResult = {
  name?: string
  place_id?: string
  formatted_address?: string
  geometry?: {
    location?: {
      lat: () => number
      lng: () => number
    }
  }
}

type GoogleAutocomplete = {
  addListener: (event: string, callback: () => void) => void
  getPlace: () => GooglePlaceResult
}

type GoogleMapInstance = unknown

type GoogleGeocoder = {
  geocode: (
    request: Record<string, unknown>,
    callback: (results: GooglePlaceResult[] | null, status: string) => void,
  ) => void
}

declare global {
  interface Window {
    google?: {
      maps?: {
        places?: {
          Autocomplete: new (input: HTMLInputElement, options: Record<string, unknown>) => GoogleAutocomplete
        }
        Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance
        Marker?: new (options: Record<string, unknown>) => unknown
        Geocoder?: new () => GoogleGeocoder
      }
    }
    __meditrackGoogleMapsPromise?: Promise<void>
  }
}

function LocationMapPreview({ loc }: { loc: Location }) {
  const mapRef = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>(
    GOOGLE_MAPS_API_KEY ? 'loading' : 'missing',
  )
  const hasCoordinates = loc.latitude != null && loc.longitude != null
  const mapsUrl = loc.maps_url || buildMapsUrl({
    address: loc.formatted_address || loc.address || loc.name,
    lat: loc.latitude,
    lng: loc.longitude,
    placeId: loc.google_place_id ?? undefined,
  })

  useEffect(() => {
    if (!hasCoordinates || !mapRef.current) return
    if (!GOOGLE_MAPS_API_KEY) {
      setStatus('missing')
      return
    }

    let cancelled = false
    setStatus('loading')
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !mapRef.current || !window.google?.maps?.Map) return
        const center = { lat: loc.latitude!, lng: loc.longitude! }
        const map = new window.google.maps.Map(mapRef.current, {
          center,
          zoom: 16,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
        })
        if (window.google.maps.Marker) {
          new window.google.maps.Marker({
            map,
            position: center,
            title: loc.name,
          })
        }
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => { cancelled = true }
  }, [hasCoordinates, loc.latitude, loc.longitude, loc.name])

  if (!hasCoordinates) return null

  return (
    <div style={{
      borderTop: '1px solid var(--mt-border)',
      background: '#f8fafc',
      padding: 12,
    }}>
      <div style={{
        position: 'relative',
        minHeight: 180,
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid var(--mt-border)',
        background: '#e2e8f0',
      }}>
        <div ref={mapRef} style={{ width: '100%', height: 180 }} />
        {status !== 'ready' && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: 18,
            textAlign: 'center',
            background: 'linear-gradient(135deg, #eff6ff, #f8fafc)',
            color: 'var(--mt-text-2)',
          }}>
            {status === 'loading' ? <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> : <Map size={22} />}
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--mt-text)' }}>
              {status === 'loading' && 'Cargando mapa…'}
              {status === 'missing' && 'Preview de mapa pendiente'}
              {status === 'error' && 'No se pudo cargar Google Maps'}
            </p>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45, maxWidth: 360 }}>
              {status === 'missing'
                ? 'Configura NEXT_PUBLIC_GOOGLE_MAPS_API_KEY y reinicia el frontend para ver el mapa embebido.'
                : status === 'error'
                  ? 'Revisa que Maps JavaScript API esté habilitada y que la llave permita localhost.'
                  : 'Estamos preparando la vista de ubicación.'}
            </p>
          </div>
        )}
      </div>
      {mapsUrl && (
        <a href={mapsUrl} target="_blank" rel="noreferrer" style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          marginTop: 8,
          fontSize: 12,
          fontWeight: 700,
          color: 'var(--mt-primary)',
          textDecoration: 'none',
        }}>
          Abrir en Google Maps <ExternalLink size={12} />
        </a>
      )}
    </div>
  )
}

function FormMapPreview({
  title,
  latitude,
  longitude,
  mapsUrl,
}: {
  title: string
  latitude: number | null
  longitude: number | null
  mapsUrl: string
}) {
  const mapRef = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>(
    GOOGLE_MAPS_API_KEY ? 'loading' : 'missing',
  )
  const hasCoordinates = latitude != null && longitude != null

  useEffect(() => {
    if (!hasCoordinates || !mapRef.current) return
    if (!GOOGLE_MAPS_API_KEY) {
      setStatus('missing')
      return
    }

    let cancelled = false
    setStatus('loading')
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !mapRef.current || !window.google?.maps?.Map) return
        const center = { lat: latitude!, lng: longitude! }
        const map = new window.google.maps.Map(mapRef.current, {
          center,
          zoom: 16,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
        })
        if (window.google.maps.Marker) {
          new window.google.maps.Marker({
            map,
            position: center,
            title,
          })
        }
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    return () => { cancelled = true }
  }, [hasCoordinates, latitude, longitude, title])

  if (!hasCoordinates) return null

  return (
    <div style={{
      border: '1px solid var(--mt-border)',
      borderRadius: 12,
      background: 'var(--mt-surface)',
      padding: 12,
      display: 'grid',
      gap: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--mt-text)' }}>Preview del mapa</p>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--mt-muted)' }}>
            Confirma visualmente la ubicación antes de guardar.
          </p>
        </div>
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noreferrer" style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--mt-primary)',
            textDecoration: 'none',
          }}>
            Abrir en Maps <ExternalLink size={12} />
          </a>
        )}
      </div>
      <div style={{
        position: 'relative',
        minHeight: 180,
        borderRadius: 10,
        overflow: 'hidden',
        border: '1px solid var(--mt-border)',
        background: '#e2e8f0',
      }}>
        <div ref={mapRef} style={{ width: '100%', height: 180 }} />
        {status !== 'ready' && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: 16,
            textAlign: 'center',
            background: 'linear-gradient(135deg, #eff6ff, #f8fafc)',
            color: 'var(--mt-text-2)',
          }}>
            {status === 'loading' ? <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> : <Map size={22} />}
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--mt-text)' }}>
              {status === 'loading' && 'Cargando mapa…'}
              {status === 'missing' && 'Mapa pendiente de API key'}
              {status === 'error' && 'No se pudo cargar el mapa'}
            </p>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.45, maxWidth: 340 }}>
              {status === 'missing'
                ? 'Configura la llave y reinicia el frontend para ver el mapa embebido.'
                : status === 'error'
                  ? 'Revisa Maps JavaScript API, Places API y restricciones de localhost.'
                  : 'Preparando la vista previa.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
const GOOGLE_MAPS_COUNTRY = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_COUNTRY ?? 'gt').toLowerCase()

function loadGoogleMaps() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Browser unavailable'))
  if (window.google?.maps?.places) return Promise.resolve()
  if (window.__meditrackGoogleMapsPromise) return window.__meditrackGoogleMapsPromise
  if (!GOOGLE_MAPS_API_KEY) return Promise.reject(new Error('Google Maps API key missing'))

  window.__meditrackGoogleMapsPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-meditrack-google-maps="true"]')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar Google Maps')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.dataset.meditrackGoogleMaps = 'true'
    script.async = true
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&loading=async&libraries=places`
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('No se pudo cargar Google Maps'))
    document.head.appendChild(script)
  })
  return window.__meditrackGoogleMapsPromise
}

function buildMapsUrl(params: { address?: string; lat?: number | null; lng?: number | null; placeId?: string }) {
  if (params.lat != null && params.lng != null) {
    const query = `${params.lat},${params.lng}`
    const place = params.placeId ? `&query_place_id=${encodeURIComponent(params.placeId)}` : ''
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}${place}`
  }
  if (params.address?.trim()) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(params.address.trim())}`
  }
  return ''
}

const inputStyle = {
  border: '1px solid var(--mt-border)',
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: 13,
  color: 'var(--mt-text)',
  background: 'var(--mt-surface)',
  outline: 'none',
} satisfies CSSProperties

const labelStyle = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--mt-text-2)',
} satisfies CSSProperties

// ─── Location form ────────────────────────────────────────────────────────────

function LocationForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial?: Partial<Location> & { name: string }
  onSubmit: (data: CreateLocationData) => void
  onCancel: () => void
  submitting: boolean
}) {
  const addressRef = useRef<HTMLInputElement | null>(null)
  const [name, setName] = useState(initial?.name ?? '')
  const [address, setAddress] = useState(initial?.formatted_address ?? initial?.address ?? '')
  const [formattedAddress, setFormattedAddress] = useState(initial?.formatted_address ?? '')
  const [googlePlaceId, setGooglePlaceId] = useState(initial?.google_place_id ?? '')
  const [latitude, setLatitude] = useState<number | null>(initial?.latitude ?? null)
  const [longitude, setLongitude] = useState<number | null>(initial?.longitude ?? null)
  const [latitudeText, setLatitudeText] = useState(initial?.latitude != null ? String(initial.latitude) : '')
  const [longitudeText, setLongitudeText] = useState(initial?.longitude != null ? String(initial.longitude) : '')
  const [mapsUrl, setMapsUrl] = useState(initial?.maps_url ?? buildMapsUrl({
    address: initial?.formatted_address ?? initial?.address ?? '',
    lat: initial?.latitude ?? null,
    lng: initial?.longitude ?? null,
    placeId: initial?.google_place_id ?? undefined,
  }))
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [mapsStatus, setMapsStatus] = useState<'idle' | 'loading' | 'ready' | 'missing' | 'error'>(
    GOOGLE_MAPS_API_KEY ? 'idle' : 'missing',
  )
  const [verifying, setVerifying] = useState(false)
  const [verifyMessage, setVerifyMessage] = useState('')

  const valid = name.trim().length > 0
  const hasVerifiedLocation = latitude != null && longitude != null

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY || !addressRef.current) {
      setMapsStatus('missing')
      return
    }

    let cancelled = false
    setMapsStatus('loading')
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !addressRef.current || !window.google?.maps?.places) return
        const autocomplete = new window.google.maps.places.Autocomplete(addressRef.current, {
          componentRestrictions: { country: GOOGLE_MAPS_COUNTRY },
          fields: ['place_id', 'name', 'formatted_address', 'geometry'],
        })
        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace()
          const lat = place.geometry?.location?.lat()
          const lng = place.geometry?.location?.lng()
          const nextAddress = place.formatted_address ?? addressRef.current?.value ?? ''
          const nextPlaceId = place.place_id ?? ''
          setAddress(nextAddress)
          setFormattedAddress(place.formatted_address ?? '')
          setGooglePlaceId(nextPlaceId)
          setLatitude(typeof lat === 'number' ? lat : null)
          setLongitude(typeof lng === 'number' ? lng : null)
          setLatitudeText(typeof lat === 'number' ? String(lat) : '')
          setLongitudeText(typeof lng === 'number' ? String(lng) : '')
          setMapsUrl(buildMapsUrl({ address: nextAddress, lat, lng, placeId: nextPlaceId }))
          setVerifyMessage('Ubicación seleccionada desde Google Maps.')
          if (place.name) setName(current => current.trim() ? current : place.name ?? current)
        })
        setMapsStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setMapsStatus('error')
      })

    return () => { cancelled = true }
  }, [])

  function handleAddressChange(value: string) {
    setAddress(value)
    setFormattedAddress('')
    setGooglePlaceId('')
    setVerifyMessage('')
    if (!latitudeText.trim() || !longitudeText.trim()) {
      setLatitude(null)
      setLongitude(null)
      setMapsUrl(buildMapsUrl({ address: value }))
    }
  }

  function handleLatitudeChange(value: string) {
    setLatitudeText(value)
    setVerifyMessage('')
    const next = Number(value)
    const valid = Number.isFinite(next) && next >= -90 && next <= 90
    setLatitude(valid ? next : null)
    setMapsUrl(buildMapsUrl({
      address,
      lat: valid ? next : null,
      lng: longitude,
      placeId: googlePlaceId || undefined,
    }))
  }

  function handleLongitudeChange(value: string) {
    setLongitudeText(value)
    setVerifyMessage('')
    const next = Number(value)
    const valid = Number.isFinite(next) && next >= -180 && next <= 180
    setLongitude(valid ? next : null)
    setMapsUrl(buildMapsUrl({
      address,
      lat: latitude,
      lng: valid ? next : null,
      placeId: googlePlaceId || undefined,
    }))
  }

  async function verifyAddress() {
    if (!address.trim()) {
      setVerifyMessage('Escribe una dirección o nombre de lugar antes de verificar.')
      return
    }
    if (!GOOGLE_MAPS_API_KEY) {
      setMapsStatus('missing')
      setVerifyMessage('Falta configurar la llave de Google Maps para verificar automáticamente.')
      return
    }

    setVerifying(true)
    setVerifyMessage('')
    try {
      await loadGoogleMaps()
      if (!window.google?.maps?.Geocoder) throw new Error('Geocoder unavailable')

      const geocoder = new window.google.maps.Geocoder()
      const results = await new Promise<GooglePlaceResult[]>((resolve, reject) => {
        geocoder.geocode(
          {
            address: address.trim(),
            componentRestrictions: { country: GOOGLE_MAPS_COUNTRY },
          },
          (items, status) => {
            if (status === 'OK' && items?.length) {
              resolve(items)
              return
            }
            reject(new Error(status || 'ZERO_RESULTS'))
          },
        )
      })

      const place = results[0]
      const lat = place.geometry?.location?.lat()
      const lng = place.geometry?.location?.lng()
      if (typeof lat !== 'number' || typeof lng !== 'number') throw new Error('Missing coordinates')

      const nextAddress = place.formatted_address ?? address.trim()
      const nextPlaceId = place.place_id ?? ''
      setAddress(nextAddress)
      setFormattedAddress(place.formatted_address ?? '')
      setGooglePlaceId(nextPlaceId)
      setLatitude(lat)
      setLongitude(lng)
      setLatitudeText(String(lat))
      setLongitudeText(String(lng))
      setMapsUrl(buildMapsUrl({ address: nextAddress, lat, lng, placeId: nextPlaceId }))
      setMapsStatus('ready')
      setVerifyMessage('Ubicación verificada. Revisa el mapa antes de guardar.')
    } catch {
      setMapsStatus('error')
      setVerifyMessage('No se pudo verificar esa dirección. Prueba con una dirección más específica o selecciona una sugerencia.')
    } finally {
      setVerifying(false)
    }
  }

  function submit() {
    onSubmit({
      name: name.trim(),
      address: address.trim() || null,
      formatted_address: formattedAddress.trim() || null,
      google_place_id: googlePlaceId || null,
      latitude,
      longitude,
      maps_url: mapsUrl || null,
      phone: phone.trim() || null,
    })
  }

  return (
    <div style={{
      border: '1px solid var(--mt-border)', borderRadius: 10,
      padding: 16, background: 'var(--mt-bg)',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{
        border: `1px solid ${mapsStatus === 'missing' ? '#fde68a' : '#bfdbfe'}`,
        background: mapsStatus === 'missing' ? '#fffbeb' : '#eff6ff',
        borderRadius: 10,
        padding: '10px 12px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
      }}>
        <Navigation size={15} color={mapsStatus === 'missing' ? '#b45309' : '#2563eb'} style={{ marginTop: 2, flexShrink: 0 }} />
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: mapsStatus === 'missing' ? '#92400e' : '#1e3a8a' }}>
            {mapsStatus === 'missing' ? 'Google Maps pendiente de configurar' : 'Precisión con Google Maps'}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 12, lineHeight: 1.5, color: mapsStatus === 'missing' ? '#b45309' : '#1d4ed8' }}>
            {mapsStatus === 'missing'
              ? 'Para activar búsqueda automática agrega NEXT_PUBLIC_GOOGLE_MAPS_API_KEY en apps/frontend/.env.local y reinicia el frontend. Mientras tanto puedes guardar dirección, coordenadas y enlace manualmente.'
              : 'Busca la sede como aparece en Maps. Al seleccionarla guardamos dirección, coordenadas y enlace para ubicarla después.'}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
        <div style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={labelStyle}>Nombre *</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ej: Sede Central, Sucursal Norte…"
            style={inputStyle}
          />
        </div>
        <div style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={labelStyle}>Dirección o lugar en Google Maps</label>
          <input
            ref={addressRef}
            value={address ?? ''}
            onChange={e => handleAddressChange(e.target.value)}
            placeholder={GOOGLE_MAPS_API_KEY ? 'Busca y selecciona la sede…' : 'Calle, colonia, municipio…'}
            style={inputStyle}
          />
          <span style={{
            fontSize: 11,
            color: mapsStatus === 'ready' ? '#047857' : mapsStatus === 'missing' ? 'var(--mt-muted)' : '#b45309',
          }}>
            {mapsStatus === 'ready' && 'Autocompletado activo'}
            {mapsStatus === 'loading' && 'Cargando Google Maps…'}
            {mapsStatus === 'missing' && 'Sin llave configurada: puedes guardar manualmente y abrir Maps para verificar.'}
            {mapsStatus === 'error' && 'No se pudo cargar Google Maps. Revisa la llave o restricciones.'}
          </span>
        </div>
        <div style={{ flex: '0 1 160px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={labelStyle}>Teléfono</label>
          <input
            value={phone ?? ''}
            onChange={e => setPhone(e.target.value)}
            placeholder="+502 2222-2222"
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{
        border: '1px solid var(--mt-border)',
        borderRadius: 10,
        background: 'var(--mt-surface)',
        padding: 12,
        display: 'grid',
        gap: 10,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--mt-text)' }}>
              Datos de precisión
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--mt-muted)', lineHeight: 1.45 }}>
              Si aún no tienes la API, copia latitud/longitud desde Google Maps y pega el enlace aquí.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <ClinicalButton
              variant="outline"
              size="sm"
              onClick={verifyAddress}
              disabled={verifying || !address.trim()}
            >
              {verifying ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Navigation size={13} />}
              Verificar ubicación
            </ClinicalButton>
            {address && (
              <a href={buildMapsUrl({ address })} target="_blank" rel="noreferrer" style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--mt-primary)',
                textDecoration: 'none',
              }}>
                Buscar dirección <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelStyle}>Latitud</label>
            <input
              value={latitudeText}
              onChange={e => handleLatitudeChange(e.target.value)}
              placeholder="14.6349"
              inputMode="decimal"
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelStyle}>Longitud</label>
            <input
              value={longitudeText}
              onChange={e => handleLongitudeChange(e.target.value)}
              placeholder="-90.5069"
              inputMode="decimal"
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={labelStyle}>Enlace de Google Maps</label>
            <input
              value={mapsUrl}
              onChange={e => setMapsUrl(e.target.value)}
              placeholder="https://www.google.com/maps/..."
              style={inputStyle}
            />
          </div>
        </div>
        {verifyMessage && (
          <div style={{
            border: `1px solid ${hasVerifiedLocation ? '#bbf7d0' : '#fde68a'}`,
            background: hasVerifiedLocation ? '#f0fdf4' : '#fffbeb',
            color: hasVerifiedLocation ? '#166534' : '#92400e',
            borderRadius: 8,
            padding: '8px 10px',
            fontSize: 12,
            lineHeight: 1.45,
          }}>
            {verifyMessage}
          </div>
        )}
      </div>

      <FormMapPreview
        title={name || 'Sede'}
        latitude={latitude}
        longitude={longitude}
        mapsUrl={mapsUrl}
      />

      {(address || hasVerifiedLocation) && (
        <div style={{
          border: `1px solid ${hasVerifiedLocation ? '#bbf7d0' : '#fde68a'}`,
          background: hasVerifiedLocation ? '#f0fdf4' : '#fffbeb',
          color: hasVerifiedLocation ? '#166534' : '#92400e',
          borderRadius: 10,
          padding: '9px 11px',
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          fontSize: 12,
        }}>
          <span>
            {hasVerifiedLocation
              ? `Ubicación verificada: ${latitude?.toFixed(5)}, ${longitude?.toFixed(5)}`
              : 'Dirección manual pendiente de selección/verificación en Maps'}
          </span>
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noreferrer" style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              color: hasVerifiedLocation ? '#047857' : '#b45309',
              fontWeight: 700, textDecoration: 'none',
            }}>
              Abrir en Maps <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <ClinicalButton variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
          Cancelar
        </ClinicalButton>
        <ClinicalButton
          variant="solid" size="sm"
          onClick={submit}
          disabled={!valid || submitting}
        >
          {submitting ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : null}
          {initial ? 'Guardar cambios' : 'Crear sede'}
        </ClinicalButton>
      </div>
    </div>
  )
}

// ─── Location row ─────────────────────────────────────────────────────────────

function LocationRow({
  loc,
  onEdit,
  onDeactivate,
  isCurrentUser,
}: {
  loc: Location
  onEdit: (loc: Location) => void
  onDeactivate: (loc: Location) => void
  isCurrentUser: boolean
}) {
  const deptCount = loc.departments.filter(d => d.is_active).length
  const displayAddress = loc.formatted_address || loc.address || 'Sin dirección registrada'
  const mapsUrl = loc.maps_url || buildMapsUrl({
    address: displayAddress,
    lat: loc.latitude,
    lng: loc.longitude,
    placeId: loc.google_place_id ?? undefined,
  })
  const hasCoordinates = loc.latitude != null && loc.longitude != null

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'auto minmax(0, 1fr) auto',
      alignItems: 'center',
      gap: 12,
      padding: '12px 14px',
      borderBottom: '1px solid var(--mt-border)',
      opacity: loc.is_active ? 1 : 0.5,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: loc.is_active ? 'var(--mt-primary-subtle)' : 'var(--mt-elevated)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <MapPin size={17} color={loc.is_active ? 'var(--mt-primary)' : 'var(--mt-muted)'} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--mt-text)' }}>{loc.name}</span>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 7px',
            borderRadius: 999,
            background: hasCoordinates ? '#dcfce7' : '#fef3c7',
            color: hasCoordinates ? '#166534' : '#92400e',
          }}>
            {hasCoordinates ? 'Maps verificado' : 'Ubicación manual'}
          </span>
          {!loc.is_active && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 999,
              background: 'var(--mt-elevated)', color: 'var(--mt-muted)',
            }}>Inactiva</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--mt-muted)', marginTop: 3, lineHeight: 1.45 }}>
          {displayAddress}
          {loc.phone ? ` · ${loc.phone}` : ''}
          {' · '}
          <span style={{ color: 'var(--mt-text-2)' }}>
            {deptCount} departamento{deptCount !== 1 ? 's' : ''}
          </span>
        </div>
        {hasCoordinates && (
          <div style={{ fontSize: 11, color: 'var(--mt-muted)', marginTop: 3 }}>
            {loc.latitude?.toFixed(5)}, {loc.longitude?.toFixed(5)}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noreferrer"
            title="Abrir en Google Maps"
            style={{
              width: 30, height: 30, borderRadius: 7,
              border: '1px solid var(--mt-border)', background: 'var(--mt-surface)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--mt-primary)',
            }}
          >
            <ExternalLink size={13} />
          </a>
        )}
        <button
          onClick={() => onEdit(loc)}
          title="Editar"
          style={{
            width: 30, height: 30, borderRadius: 7,
            border: '1px solid var(--mt-border)', background: 'var(--mt-surface)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--mt-text-2)',
          }}
        >
          <Pencil size={13} />
        </button>
        {loc.is_active && (
          <button
            onClick={() => onDeactivate(loc)}
            title="Desactivar sede"
            disabled={isCurrentUser}
            style={{
              width: 30, height: 30, borderRadius: 7,
              border: '1px solid var(--mt-border)', background: 'var(--mt-surface)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--mt-danger)',
              opacity: isCurrentUser ? 0.4 : 1,
            }}
          >
            <Power size={13} />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LocationsSettingsPage() {
  const { token } = useAuth()
  const [locations, setLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Location | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const toast$ = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      setLocations(await listLocations(token))
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar sedes')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  async function handleCreate(data: CreateLocationData) {
    if (!token) return
    setSubmitting(true)
    try {
      await createLocation(token, data)
      await load()
      setShowForm(false)
      toast$('Sede creada')
    } catch (e: unknown) {
      toast$(e instanceof Error ? e.message : 'Error', false)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUpdate(data: CreateLocationData) {
    if (!token || !editing) return
    setSubmitting(true)
    try {
      await updateLocation(token, editing.id, data)
      await load()
      setEditing(null)
      toast$('Sede actualizada')
    } catch (e: unknown) {
      toast$(e instanceof Error ? e.message : 'Error', false)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeactivate(loc: Location) {
    if (!token) return
    if (!confirm(`¿Desactivar la sede "${loc.name}"? Los departamentos asociados quedarán sin sede.`)) return
    try {
      await deactivateLocation(token, loc.id)
      await load()
      toast$('Sede desactivada')
    } catch (e: unknown) {
      toast$(e instanceof Error ? e.message : 'Error', false)
    }
  }

  const active   = locations.filter(l => l.is_active)
  const inactive = locations.filter(l => !l.is_active)

  return (
    <ClinicalPage>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 100,
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 16px', borderRadius: 10,
          background: toast.ok ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${toast.ok ? '#bbf7d0' : '#fecaca'}`,
          boxShadow: '0 4px 16px rgba(0,0,0,.1)', fontSize: 13,
          color: toast.ok ? '#166534' : '#991b1b',
        }}>
          {toast.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          {toast.msg}
        </div>
      )}

      <ClinicalHeader
        title="Sedes"
        subtitle="Gestiona las ubicaciones físicas de tu clínica u hospital"
        icon={MapPin}
        actions={
          !showForm && !editing ? (
            <ClinicalButton variant="solid" size="sm" onClick={() => setShowForm(true)}>
              <Plus size={14} />
              Nueva sede
            </ClinicalButton>
          ) : undefined
        }
      />

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 20px 32px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Create form */}
        {showForm && (
          <LocationForm
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
            submitting={submitting}
          />
        )}

        {loading ? (
          <LoadingState label="Cargando sedes…" />
        ) : error ? (
          <div style={{ padding: 20, color: 'var(--mt-danger)', fontSize: 13 }}>{error}</div>
        ) : (
          <>
            {/* Active locations */}
            <MTPanel title={`Sedes activas (${active.length})`} icon={Building2} accent="blue">
              {active.length === 0 ? (
                <div style={{ padding: '28px 20px', textAlign: 'center' }}>
                  <MapPin size={28} color="var(--mt-muted)" style={{ margin: '0 auto 10px' }} />
                  <p style={{ fontSize: 13, color: 'var(--mt-text-2)', marginBottom: 6 }}>
                    No hay sedes configuradas
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--mt-muted)' }}>
                    Crea una sede para organizar los departamentos por ubicación física.
                  </p>
                </div>
              ) : (
                active.map(loc => (
                  editing?.id === loc.id ? (
                    <div key={loc.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--mt-border)' }}>
                      <LocationForm
                        initial={loc}
                        onSubmit={handleUpdate}
                        onCancel={() => setEditing(null)}
                        submitting={submitting}
                      />
                    </div>
                  ) : (
                    <Fragment key={loc.id}>
                      <LocationRow
                        loc={loc}
                        onEdit={setEditing}
                        onDeactivate={handleDeactivate}
                        isCurrentUser={false}
                      />
                      <LocationMapPreview loc={loc} />
                    </Fragment>
                  )
                ))
              )}
            </MTPanel>

            {/* Inactive */}
            {inactive.length > 0 && (
              <MTPanel title={`Sedes inactivas (${inactive.length})`} icon={X} accent="slate">
                {inactive.map(loc => (
                  editing?.id === loc.id ? (
                    <div key={loc.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--mt-border)' }}>
                      <LocationForm
                        initial={loc}
                        onSubmit={handleUpdate}
                        onCancel={() => setEditing(null)}
                        submitting={submitting}
                      />
                    </div>
                  ) : (
                    <LocationRow
                      key={loc.id}
                      loc={loc}
                      onEdit={setEditing}
                      onDeactivate={handleDeactivate}
                      isCurrentUser={false}
                    />
                  )
                ))}
              </MTPanel>
            )}
          </>
        )}
      </div>
    </ClinicalPage>
  )
}
