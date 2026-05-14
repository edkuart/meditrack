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
        <Link href={`/patients/${p.id}`} className="flex items-center gap-3 group">
          <MTAvatar name={fullName} size={36} />
          <div>
            <p className="text-sm font-medium text-slate-900 group-hover:text-blue-600 transition-colors">
              {fullName}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
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
        <div className="flex flex-col gap-0.5">
          {p.phone && (
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <Phone size={11} className="text-slate-400" />{p.phone}
            </span>
          )}
          {p.email && (
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <Mail size={11} className="text-slate-400" />{p.email}
            </span>
          )}
          {!p.phone && !p.email && <span className="text-xs text-slate-300">—</span>}
        </div>
      )
    },
  },
  {
    id: 'status',
    header: 'Estado',
    cell: ({ row }) => (
      <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-medium">
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
        <div className="flex items-center justify-end gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-700" onClick={e => e.stopPropagation()}>
                <MoreHorizontal size={15} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-sm">
              <DropdownMenuItem asChild>
                <Link href={`/patients/${p.id}`}>Ver perfil</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/patients/${p.id}?tab=portal`}>Acceso portal</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Link href={`/patients/${p.id}`} className="text-slate-300 hover:text-slate-600 transition-colors">
            <ChevronRight size={16} />
          </Link>
        </div>
      )
    },
  },
]
