'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  MapPin, Plus, Pencil, Power, Building2,
  Loader2, CheckCircle2, AlertCircle, X,
} from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import {
  listLocations, createLocation, updateLocation, deactivateLocation,
  type Location, type CreateLocationData,
} from '@/lib/doctor/locations-api'
import {
  ClinicalButton, ClinicalHeader, ClinicalPage, LoadingState, MTPanel,
} from '@/components/doctor/clinical-ui'

// ─── Location form ────────────────────────────────────────────────────────────

function LocationForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial?: { name: string; address?: string | null; phone?: string | null }
  onSubmit: (data: CreateLocationData) => void
  onCancel: () => void
  submitting: boolean
}) {
  const [name, setName]       = useState(initial?.name ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [phone, setPhone]     = useState(initial?.phone ?? '')

  const valid = name.trim().length > 0

  return (
    <div style={{
      border: '1px solid var(--mt-border)', borderRadius: 10,
      padding: 16, background: 'var(--mt-bg)',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--mt-text-2)' }}>Nombre *</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ej: Sede Central, Sucursal Norte…"
            style={{
              border: '1px solid var(--mt-border)', borderRadius: 8,
              padding: '7px 10px', fontSize: 13, color: 'var(--mt-text)',
              background: 'var(--mt-surface)', outline: 'none',
            }}
          />
        </div>
        <div style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--mt-text-2)' }}>Dirección</label>
          <input
            value={address ?? ''}
            onChange={e => setAddress(e.target.value)}
            placeholder="Calle, colonia, municipio…"
            style={{
              border: '1px solid var(--mt-border)', borderRadius: 8,
              padding: '7px 10px', fontSize: 13, color: 'var(--mt-text)',
              background: 'var(--mt-surface)', outline: 'none',
            }}
          />
        </div>
        <div style={{ flex: '0 1 160px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--mt-text-2)' }}>Teléfono</label>
          <input
            value={phone ?? ''}
            onChange={e => setPhone(e.target.value)}
            placeholder="+502 2222-2222"
            style={{
              border: '1px solid var(--mt-border)', borderRadius: 8,
              padding: '7px 10px', fontSize: 13, color: 'var(--mt-text)',
              background: 'var(--mt-surface)', outline: 'none',
            }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <ClinicalButton variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
          Cancelar
        </ClinicalButton>
        <ClinicalButton
          variant="solid" size="sm"
          onClick={() => onSubmit({ name: name.trim(), address: address || undefined, phone: phone || undefined })}
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

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--mt-text)' }}>{loc.name}</span>
          {!loc.is_active && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 999,
              background: 'var(--mt-elevated)', color: 'var(--mt-muted)',
            }}>Inactiva</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--mt-muted)', marginTop: 1 }}>
          {loc.address || '—'}
          {loc.phone ? ` · ${loc.phone}` : ''}
          {' · '}
          <span style={{ color: 'var(--mt-text-2)' }}>
            {deptCount} departamento{deptCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
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
                    <LocationRow
                      key={loc.id}
                      loc={loc}
                      onEdit={setEditing}
                      onDeactivate={handleDeactivate}
                      isCurrentUser={false}
                    />
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
