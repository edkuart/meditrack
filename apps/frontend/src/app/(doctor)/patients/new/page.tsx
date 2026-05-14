'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, UserPlus } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/lib/doctor/auth-context'
import { createPatient } from '@/lib/doctor/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

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

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs text-red-500 mt-1">{message}</p>
}

export default function NewPatientPage() {
  const router = useRouter()
  const { token } = useAuth()

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
    if (!token) return
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
      router.push(`/patients/${patient.id}`)
    } catch (err) {
      setError('root', {
        message: err instanceof Error ? err.message : 'Error al crear el paciente',
      })
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" asChild className="h-8 w-8 text-slate-400">
          <Link href="/patients"><ArrowLeft size={18} /></Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Nuevo paciente</h1>
          <p className="text-sm text-slate-400">Crea la ficha clínica del paciente</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Datos personales */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-700">Datos personales</CardTitle>
            <CardDescription className="text-xs">Información de identificación del paciente</CardDescription>
          </CardHeader>
          <Separator className="mb-4" />
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="first_name" className="text-xs font-medium text-slate-600">
                  Nombre <span className="text-red-400">*</span>
                </Label>
                <Input id="first_name" {...register('first_name')} className="h-9 text-sm" />
                <FieldError message={errors.first_name?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="last_name" className="text-xs font-medium text-slate-600">
                  Apellido <span className="text-red-400">*</span>
                </Label>
                <Input id="last_name" {...register('last_name')} className="h-9 text-sm" />
                <FieldError message={errors.last_name?.message} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="id_number" className="text-xs font-medium text-slate-600">N° Cédula / ID</Label>
                <Input id="id_number" {...register('id_number')} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="date_of_birth" className="text-xs font-medium text-slate-600">Fecha de nacimiento</Label>
                <Input id="date_of_birth" type="date" {...register('date_of_birth')} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">Sexo</Label>
                <Select onValueChange={val => setValue('sex', val as FormValues['sex'])}>
                  <SelectTrigger className="h-9 text-sm">
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
          </CardContent>
        </Card>

        {/* Contacto */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-700">Contacto</CardTitle>
            <CardDescription className="text-xs">Necesario para enviar el acceso al portal</CardDescription>
          </CardHeader>
          <Separator className="mb-4" />
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-medium text-slate-600">Correo electrónico</Label>
                <Input id="email" type="email" {...register('email')} className="h-9 text-sm" />
                <FieldError message={errors.email?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-xs font-medium text-slate-600">WhatsApp</Label>
                <Input id="phone" type="tel" placeholder="+502 5555 5555" {...register('phone')} className="h-9 text-sm" />
                <p className="text-xs text-slate-400">Con código de país para el acceso por WhatsApp</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notas clínicas */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-700">Notas clínicas</CardTitle>
          </CardHeader>
          <Separator className="mb-4" />
          <CardContent>
            <Textarea
              {...register('notes')}
              rows={3}
              placeholder="Alergias, antecedentes relevantes, condiciones crónicas…"
              className="text-sm resize-none"
            />
          </CardContent>
        </Card>

        {errors.root && (
          <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2 border border-red-200">
            {errors.root.message}
          </p>
        )}

        <div className="flex gap-3 justify-end">
          <Button variant="ghost" asChild className="text-slate-600">
            <Link href="/patients">Cancelar</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting} className="gap-2 bg-blue-600 hover:bg-blue-700">
            {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            Crear paciente
          </Button>
        </div>
      </form>
    </div>
  )
}
