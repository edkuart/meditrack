'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LoadingState } from '@/components/doctor/clinical-ui'

export default function StaffPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/settings/staff')
  }, [router])

  return <LoadingState label="Abriendo gestión de personal..." />
}
