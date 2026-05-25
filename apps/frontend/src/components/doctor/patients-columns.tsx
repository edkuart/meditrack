'use client'

import type { ColumnDef } from '@tanstack/react-table'
import { ChevronRight, Mail, MoreHorizontal, Phone } from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MTAvatar } from '@/components/doctor/clinical-ui'
import type { Patient } from '@/lib/doctor/api'

function calcAge(dob: string | null): string {
  if (!dob) return '—'
  const years = Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365))
  return `${years} a`
}

const SEX_LABELS: Record<string, string> = { male: 'M', female: 'F', other: 'O' }

export const patientsColumns: ColumnDef<Patient>[] = [
  {
    id: 'name',
    accessorFn: row => `${row.first_name} ${row.last_name}`,
    header: 'Paciente',
    cell: ({ row }) => {
      const p = row.original
      const fullName = `${p.first_name} ${p.last_name}`
      return (
        <Link href={`/patients/${p.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
          <MTAvatar name={fullName} size={36} />
          <div>
            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--mt-text)', margin: 0 }}>
              {fullName}
            </p>
            <p style={{ fontSize: 11, color: 'var(--mt-muted)', marginTop: 2, margin: '2px 0 0' }}>
              {p.mrn && <span style={{ fontFamily: 'monospace', color: 'var(--mt-primary)', marginRight: 4 }}>{p.mrn}</span>}
              {calcAge(p.date_of_birth)}
              {p.sex ? ` · ${SEX_LABELS[p.sex]}` : ''}
              {p.id_number ? ` · ${p.id_number}` : ''}
            </p>
          </div>
        </Link>
      )
    },
  },
  {
    id: 'contact',
    header: 'Contacto',
    cell: ({ row }) => {
      const p = row.original
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {p.phone && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--mt-text-2)' }}>
              <Phone size={11} color="var(--mt-muted)" />{p.phone}
            </span>
          )}
          {p.email && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--mt-text-2)' }}>
              <Mail size={11} color="var(--mt-muted)" />{p.email}
            </span>
          )}
          {!p.phone && !p.email && <span style={{ fontSize: 12, color: 'var(--mt-muted)' }}>—</span>}
        </div>
      )
    },
  },
  {
    id: 'status',
    header: 'Estado',
    cell: () => (
      <Badge variant="secondary" style={{
        background: 'var(--mt-success-subtle)', color: '#065F46',
        border: '1px solid #6EE7B7', fontSize: 11, fontWeight: 500,
      }}>
        Activo
      </Badge>
    ),
  },
  {
    id: 'actions',
    header: '',
    size: 80,
    cell: ({ row }) => {
      const p = row.original
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" style={{ width: 28, height: 28, color: 'var(--mt-muted)' }} onClick={e => e.stopPropagation()}>
                <MoreHorizontal size={15} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" style={{ fontSize: 13 }}>
              <DropdownMenuItem asChild>
                <Link href={`/patients/${p.id}`}>Ver perfil</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/patients/${p.id}?tab=portal`}>Acceso portal</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Link href={`/patients/${p.id}`} style={{ color: 'var(--mt-muted)', display: 'flex', transition: 'color .15s' }}>
            <ChevronRight size={16} />
          </Link>
        </div>
      )
    },
  },
]
