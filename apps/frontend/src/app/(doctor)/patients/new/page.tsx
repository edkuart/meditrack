'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, UserPlus, Mail, Phone, User, Hash, Calendar, Users, ShieldAlert } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/lib/doctor/auth-context'
import { createPatient } from '@/lib/doctor/api'
import { hasPermission, PERMISSIONS } from '@/lib/doctor/permissions'
import { getDefaultClinicalPath } from '@/lib/doctor/navigation'
import { MTButton } from '@/components/doctor/clinical-ui'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const schema = z.object({
  first_name: z.string().min(1, 'Nombre requerido'),
  last_name: z.string().min(1, 'Apellido requerido'),
  email: z.string().email('Correo inválido').optional().or(z.literal('')),
  phone: z.string().optional(),
  id_number: z.string().optional(),
  date_of_birth: z.string().optional(),
  sex: z.enum(['male', 'female', 'other', '']).optional(),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

const inputStyle: React.CSSProperties = {
  width: '100%', border: '1px solid var(--mt-border)', borderRadius: 8,
  padding: '8px 12px', fontSize: 13, color: 'var(--mt-text)',
  background: 'var(--mt-surface)', outline: 'none',
  fontFamily: 'var(--mt-font)', boxSizing: 'border-box',
  height: 36,
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 500,
  color: 'var(--mt-text-2)', marginBottom: 5,
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div style={{
      border: '1px solid var(--mt-border)', borderRadius: 14,
      background: 'var(--mt-surface)', boxShadow: 'var(--mt-shadow-sm)', overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--mt-border)' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--mt-text)', margin: 0 }}>{title}</p>
        {description && <p style={{ fontSize: 11, color: 'var(--mt-muted)', margin: '2px 0 0' }}>{description}</p>}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  )
}

export default function NewPatientPage() {
  const router = useRouter()
  const { token, user } = useAuth()
  const canCreatePatients = hasPermission(user?.role, PERMISSIONS.PATIENT_WRITE, user?.permissions)

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { sex: '' },
  })

  async function onSubmit(data: FormValues) {
    if (!token || !canCreatePatients) return
    try {
      const patient = await createPatient(token, {
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email || undefined,
        phone: data.phone || undefined,
        id_number: data.id_number || undefined,
        date_of_birth: data.date_of_birth || undefined,
        sex: data.sex || undefined,
        notes: data.notes || undefined,
      })
      router.push(`/patients/${patient.id}?flow=new`)
    } catch (err) {
      setError('root', {
        message: err instanceof Error ? err.message : 'Error al crear el paciente',
      })
    }
  }

  if (user && !canCreatePatients) {
    return (
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '48px 16px', fontFamily: 'var(--mt-font)', textAlign: 'center' }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14, background: 'var(--mt-elevated)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px',
        }}>
          <ShieldAlert size={24} color="var(--mt-muted)" />
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--mt-text)', margin: '0 0 8px' }}>
          Acción restringida
        </h1>
        <p style={{ fontSize: 14, color: 'var(--mt-text-2)', margin: '0 0 20px', lineHeight: 1.6 }}>
          Tu rol no tiene permiso para crear pacientes.
        </p>
        <MTButton type="button" variant="outline" onClick={() => router.replace(getDefaultClinicalPath(user))}>
          Volver
        </MTButton>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 16px', fontFamily: 'var(--mt-font)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href="/patients" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32, borderRadius: 8,
          border: '1px solid var(--mt-border)', color: 'var(--mt-muted)',
        }}>
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--mt-text)', margin: 0 }}>Nuevo paciente</h1>
          <p style={{ fontSize: 12, color: 'var(--mt-muted)', margin: 0 }}>Crea la ficha clínica del paciente</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Section title="Datos personales" description="Información de identificación del paciente">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>
                  Nombre <span style={{ color: 'var(--mt-danger)' }}>*</span>
                </label>
                <input {...register('first_name')} style={inputStyle} />
                {errors.first_name && <p style={{ fontSize: 11, color: 'var(--mt-danger)', marginTop: 4 }}>{errors.first_name.message}</p>}
              </div>
              <div>
                <label style={labelStyle}>
                  Apellido <span style={{ color: 'var(--mt-danger)' }}>*</span>
                </label>
                <input {...register('last_name')} style={inputStyle} />
                {errors.last_name && <p style={{ fontSize: 11, color: 'var(--mt-danger)', marginTop: 4 }}>{errors.last_name.message}</p>}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>N° Cédula / ID</label>
                <input {...register('id_number')} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Fecha de nacimiento</label>
                <input type="date" {...register('date_of_birth')} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Sexo</label>
                <Select onValueChange={val => setValue('sex', val as FormValues['sex'])}>
                  <SelectTrigger style={{ height: 36, fontSize: 13, border: '1px solid var(--mt-border)', background: 'var(--mt-surface)' }}>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Masculino</SelectItem>
                    <SelectItem value="female">Femenino</SelectItem>
                    <SelectItem value="other">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Contacto" description="Necesario para enviar el acceso al portal">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Correo electrónico</label>
              <input type="email" {...register('email')} style={inputStyle} />
              {errors.email && <p style={{ fontSize: 11, color: 'var(--mt-danger)', marginTop: 4 }}>{errors.email.message}</p>}
            </div>
            <div>
              <label style={labelStyle}>WhatsApp</label>
              <input type="tel" placeholder="+502 5555 5555" {...register('phone')} style={inputStyle} />
              <p style={{ fontSize: 11, color: 'var(--mt-muted)', marginTop: 4 }}>Con código de país para acceso por WhatsApp</p>
            </div>
          </div>
        </Section>

        <Section title="Notas clínicas">
          <textarea
            {...register('notes')}
            rows={3}
            placeholder="Alergias, antecedentes relevantes, condiciones crónicas…"
            style={{ ...inputStyle, height: 'auto', resize: 'none' }}
          />
        </Section>

        {errors.root && (
          <p style={{
            fontSize: 13, color: 'var(--mt-danger)',
            background: 'var(--mt-danger-subtle)',
            borderRadius: 8, padding: '8px 12px', margin: 0,
            border: '1px solid #fecaca',
          }}>{errors.root.message}</p>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <MTButton variant="ghost" asChild>
            <Link href="/patients">Cancelar</Link>
          </MTButton>
          <MTButton
            type="submit" variant="solid" disabled={isSubmitting}
            icon={isSubmitting ? Loader2 : UserPlus}
          >
            Crear paciente
          </MTButton>
        </div>
      </form>
    </div>
  )
}
