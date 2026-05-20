'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Printer, ArrowLeft } from 'lucide-react'
import { useAuth } from '@/lib/doctor/auth-context'
import { getLabOrder, type LabOrder, type LabResultStatus } from '@/lib/doctor/lab-api'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function calcAge(dob: string | null | undefined) {
  if (!dob) return null
  return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
}

function refStr(r: { ref_min: string | null; ref_max: string | null; ref_text: string | null }) {
  if (r.ref_text) return r.ref_text
  if (r.ref_min != null && r.ref_max != null) return `${r.ref_min} – ${r.ref_max}`
  if (r.ref_min != null) return `≥ ${r.ref_min}`
  if (r.ref_max != null) return `≤ ${r.ref_max}`
  return '—'
}

function interpLabel(status: LabResultStatus) {
  const map: Record<LabResultStatus, string> = {
    PENDING: '—', NORMAL: 'Normal',
    HIGH: 'Alto ↑', LOW: 'Bajo ↓',
    CRITICAL_HIGH: 'CRÍTICO ↑', CRITICAL_LOW: 'CRÍTICO ↓',
  }
  return map[status] ?? '—'
}

function interpColor(status: LabResultStatus) {
  if (status === 'CRITICAL_HIGH' || status === 'CRITICAL_LOW') return '#991b1b'
  if (status === 'HIGH') return '#92400e'
  if (status === 'LOW') return '#1e40af'
  if (status === 'NORMAL') return '#065f46'
  return '#94a3b8'
}

function valColor(status: LabResultStatus) {
  if (status === 'CRITICAL_HIGH' || status === 'CRITICAL_LOW') return '#b91c1c'
  if (status === 'HIGH') return '#92400e'
  if (status === 'LOW') return '#1e40af'
  if (status === 'NORMAL') return '#065f46'
  return '#334155'
}

function rowBg(status: LabResultStatus) {
  if (status === 'CRITICAL_HIGH' || status === 'CRITICAL_LOW') return '#fef2f2'
  if (status === 'HIGH' || status === 'LOW') return '#fffbeb'
  return undefined
}

function asterisk(status: LabResultStatus) {
  if (status === 'CRITICAL_HIGH' || status === 'CRITICAL_LOW') return '**'
  if (status === 'HIGH' || status === 'LOW') return '*'
  return ''
}

// ─── Report layout ────────────────────────────────────────────────────────────

function LabReport({ order, generatedAt }: { order: LabOrder; generatedAt: string }) {
  const panels: Record<string, typeof order.results> = {}
  order.results.forEach(r => {
    if (!panels[r.panel_name]) panels[r.panel_name] = []
    panels[r.panel_name].push(r)
  })

  const hasAbnormal = order.results.some(r => r.status !== 'NORMAL' && r.status !== 'PENDING')
  const hasCritical = order.results.some(r => r.status === 'CRITICAL_HIGH' || r.status === 'CRITICAL_LOW')
  const age = calcAge(order.patient.date_of_birth)

  const patientFields = [
    { label: 'Paciente', value: `${order.patient.first_name} ${order.patient.last_name}` },
    { label: 'Fecha de solicitud', value: fmtDate(order.ordered_at) },
    { label: 'Médico solicitante', value: `Dr. ${order.doctor.first_name} ${order.doctor.last_name}` },
    ...(order.doctor.specialty ? [{ label: 'Especialidad', value: order.doctor.specialty }] : []),
    ...(age != null ? [{ label: 'Edad', value: `${age} años` }] : []),
    ...(order.patient.sex ? [{ label: 'Sexo', value: order.patient.sex === 'M' ? 'Masculino' : 'Femenino' }] : []),
  ]

  return (
    <div style={{ fontFamily: "'Arial', 'Helvetica Neue', sans-serif", fontSize: '10.5pt', color: '#1e293b', lineHeight: 1.4 }}>

      {/* Institution header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2.5px solid #1e3a5f', paddingBottom: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: '20pt', fontWeight: 900, color: '#1e3a5f', letterSpacing: '-0.5px', lineHeight: 1 }}>Meditrack</div>
          <div style={{ fontSize: '8.5pt', color: '#64748b', marginTop: 2 }}>Sistema de Gestión Clínica</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '10pt', fontWeight: 700, color: '#1e3a5f', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Informe de Laboratorio</div>
          <div style={{ fontSize: '8pt', color: '#64748b', fontFamily: 'monospace', marginTop: 2 }}>
            No. {order.id.slice(0, 8).toUpperCase()}
          </div>
        </div>
      </div>

      {/* Patient / order info */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px',
        background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6,
        padding: '10px 14px', marginBottom: 16,
      }}>
        {patientFields.map(f => (
          <div key={f.label}>
            <div style={{ fontSize: '7pt', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.5px', marginBottom: 2 }}>{f.label}</div>
            <div style={{ fontSize: '10pt', fontWeight: 600, color: '#1e293b' }}>{f.value}</div>
          </div>
        ))}
        {order.notes && (
          <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
            <div style={{ fontSize: '7pt', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.5px', marginBottom: 2 }}>Indicación clínica</div>
            <div style={{ fontSize: '9.5pt', color: '#334155' }}>{order.notes}</div>
          </div>
        )}
      </div>

      {/* Panels */}
      {Object.entries(panels).map(([panelName, results]) => (
        <div key={panelName} style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: '8.5pt', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.8px', color: '#1e3a5f',
            background: '#e8f0fe', padding: '5px 10px',
            borderLeft: '3px solid #1e3a5f',
          }}>
            {panelName}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9.5pt' }}>
            <thead>
              <tr>
                {['Examen', 'Resultado', 'Unidades', 'V. Normal', 'Interpretación'].map(h => (
                  <th key={h} style={{
                    background: '#f1f5f9', color: '#475569', fontSize: '7.5pt', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.4px',
                    padding: '5px 8px', border: '1px solid #e2e8f0', textAlign: 'left',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => {
                const val = r.numeric_value ?? r.value
                const status = r.status
                const ast = asterisk(status)
                const bg = rowBg(status)
                return (
                  <tr key={r.id} style={{ background: bg ?? (i % 2 !== 0 ? '#fafafa' : undefined) }}>
                    <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0' }}>
                      {r.parameter_name}
                      {ast && (
                        <sup style={{ color: status.startsWith('CRITICAL') ? '#991b1b' : '#92400e', fontWeight: 700, marginLeft: 2 }}>
                          {ast}
                        </sup>
                      )}
                    </td>
                    <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0', fontWeight: 700, color: valColor(status) }}>
                      {val ?? '—'}
                    </td>
                    <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0', color: '#64748b' }}>
                      {r.unit ?? '—'}
                    </td>
                    <td style={{ padding: '5px 8px', border: '1px solid #e2e8f0', color: '#475569', fontSize: '8.5pt' }}>
                      {refStr(r)}
                    </td>
                    <td style={{
                      padding: '5px 8px', border: '1px solid #e2e8f0',
                      color: interpColor(status), fontWeight: status.startsWith('CRITICAL') ? 700 : 500,
                      fontSize: '8.5pt',
                    }}>
                      {interpLabel(status)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}

      {/* Legend */}
      {hasAbnormal && (
        <div style={{ marginTop: 8, fontSize: '8pt', color: '#475569', borderTop: '1px solid #f1f5f9', paddingTop: 6 }}>
          {hasCritical && <span style={{ marginRight: 16 }}>** Valor crítico — notificar de inmediato</span>}
          <span>* Valor fuera del rango de referencia</span>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 20, paddingTop: 10, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ fontSize: '7.5pt', color: '#94a3b8', lineHeight: 1.7 }}>
          <div>Generado: {generatedAt}</div>
          <div>Este informe es de carácter confidencial.</div>
          <div>Uso exclusivo del personal médico autorizado.</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ borderTop: '1px solid #94a3b8', paddingTop: 4, marginTop: 36, fontSize: '8pt', color: '#475569' }}>
            Dr. {order.doctor.first_name} {order.doctor.last_name}
            {order.doctor.specialty && (
              <div style={{ fontSize: '7.5pt', color: '#94a3b8' }}>{order.doctor.specialty}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LabPrintPage() {
  const { id } = useParams<{ id: string }>()
  const { token } = useAuth()
  const [order, setOrder] = useState<LabOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [generatedAt] = useState(() =>
    new Date().toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' }),
  )

  useEffect(() => {
    if (!token || !id) return
    getLabOrder(token, id).then(o => {
      setOrder(o)
      const panels = [...new Set(o.results.map(r => r.panel_name))]
      const panelStr = panels.length > 2 ? `${panels.slice(0, 2).join(', ')} +${panels.length - 2}` : panels.join(', ')
      const dateStr = new Date(o.ordered_at).toLocaleDateString('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')
      const name = `${o.patient.first_name} ${o.patient.last_name}`
      document.title = `Lab - ${name} - ${panelStr} - ${dateStr}`
    }).finally(() => setLoading(false))
    return () => { document.title = 'Meditrack' }
  }, [token, id])

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @media screen {
          #lab-print-overlay {
            position: fixed; inset: 0; overflow-y: auto;
            background: #f1f5f9; z-index: 9999;
          }
        }
        @media print {
          body * { visibility: hidden; }
          #lab-print-overlay { visibility: visible; position: static !important; overflow: visible !important; background: white !important; }
          #lab-print-overlay * { visibility: visible; }
          .no-print { display: none !important; }
          @page { size: letter portrait; margin: 12mm 15mm; }
        }
      ` }} />

      <div id="lab-print-overlay">
        {/* Screen controls */}
        <div className="no-print" style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: 'rgba(241,245,249,.96)', backdropFilter: 'blur(8px)',
          borderBottom: '1px solid #e2e8f0',
          padding: '10px 24px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <a
            href={`/lab/${id}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', background: 'white', color: '#475569',
              border: '1px solid #e2e8f0', borderRadius: 999,
              fontSize: 13, fontWeight: 500, textDecoration: 'none',
              boxShadow: '0 1px 3px rgba(0,0,0,.08)',
            }}
          >
            <ArrowLeft size={13} /> Volver
          </a>
          <button
            onClick={() => window.print()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 18px', background: '#2563eb', color: 'white',
              border: 'none', borderRadius: 999,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(37,99,235,.30)',
            }}
          >
            <Printer size={13} /> Imprimir / Guardar PDF
          </button>
          {order && (
            <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>
              {order.patient.first_name} {order.patient.last_name} — {order.results.length} parámetros
            </span>
          )}
        </div>

        {/* Report area */}
        <div style={{ padding: '32px 24px 56px', minHeight: 'calc(100% - 57px)' }}>
          {loading ? (
            <div style={{ textAlign: 'center', paddingTop: '6rem', color: '#94a3b8', fontSize: 14 }}>Cargando…</div>
          ) : !order ? (
            <div style={{ textAlign: 'center', paddingTop: '6rem', color: '#94a3b8', fontSize: 14 }}>Orden no encontrada.</div>
          ) : (
            <div style={{
              maxWidth: 800, margin: '0 auto',
              background: 'white',
              boxShadow: '0 2px 20px rgba(0,0,0,.08)',
              borderRadius: 8,
              padding: '20mm 18mm',
            }}>
              <LabReport order={order} generatedAt={generatedAt} />
            </div>
          )}
        </div>
      </div>
    </>
  )
}
