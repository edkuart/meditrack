# Meditrack — Plataforma médica de adherencia terapéutica

## Stack

| Capa | Tecnología |
|---|---|
| Monorepo | Turborepo + npm workspaces |
| Backend | Hono + TypeScript (Node.js ESM) |
| Frontend | Next.js 15 App Router + Tailwind CSS |
| Base de datos | PostgreSQL + Drizzle ORM |
| Auth | JWT (HS256, jose) + refresh tokens DB-backed |
| Tipos compartidos | `@meditrack/shared-types` (Zod schemas) |

## Estructura

```
apps/
  backend/   → @meditrack/backend  (puerto 3001)
  frontend/  → @meditrack/frontend (puerto 3000)
packages/
  shared-types/ → @meditrack/shared-types
```

## Comandos

```bash
# Desde la raíz del monorepo
npm run dev          # levanta backend + frontend en paralelo
npm run typecheck    # typecheck todos los workspaces
npm run test         # tests del backend

# Backend específico
npm run dev --workspace=apps/backend
npm run db:generate --workspace=apps/backend   # genera migración SQL
npm run db:migrate --workspace=apps/backend    # aplica migraciones
npm run db:studio --workspace=apps/backend     # Drizzle Studio UI
```

## Variables de entorno

Copiar `apps/backend/.env.example` → `apps/backend/.env` y completar:
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — mínimo 32 chars, string aleatorio
- `JWT_REFRESH_SECRET` — diferente al anterior
- `FRONTEND_URL` — para CORS

## Arquitectura de datos

- **Multi-tenant**: cada clínica/consultorio es un `tenant`. Todas las tablas clínicas tienen `tenant_id`. Las queries siempre filtran por `tenant_id` explícitamente + RLS en PostgreSQL como capa de seguridad adicional.
- **Audit log**: tabla `audit_logs` append-only. Las reglas de BD bloquean UPDATE y DELETE. Nunca omitir el audit en operaciones clínicas.
- **Dosis**: la ventana de edición es `can_edit_until = scheduled_at + 24h`. Esta regla es inmutable — nunca bypassear.

## Historia Clínica — Método de Weed (POMR)

Meditrack implementa el **Problem-Oriented Medical Record** (Lawrence Weed) adaptado al formato latinoamericano. Sin regulación guatemalteca específica, se sigue el estándar docente médico regional.

### Estructura POMR

| Componente | Tabla/Campo | Descripción |
|---|---|---|
| **Base de datos** | `patient_background` | Antecedentes estructurados por categoría |
| **Lista de problemas** | `patient_problems` | Problemas numerados con ICD-10 y estado |
| **Nota SOAP** | campos en `encounters` | Subjetivo, Objetivo, Assessment, Plan |
| **Signos vitales** | `vital_signs` | Por encuentro, con trending histórico |

### Campos SOAP en `encounters`

- `chief_complaint` — Motivo de consulta (max 500 chars)
- `subjective` — HPI, síntomas reportados, ROS
- `objective` — Examen físico, hallazgos clínicos
- `assessment` — Impresión diagnóstica, CIE-10, diferenciales
- `plan` — Plan Dx, Rx, Ed (educación al paciente)

### Antecedentes (`patient_background.category`)

| Categoría | Significado |
|---|---|
| `AHF` | Antecedentes Heredofamiliares |
| `APP` | Antecedentes Patológicos Personales |
| `APNP` | Antecedentes Patológicos No Patológicos (hábitos/estilo de vida) |
| `AQ` | Antecedentes Quirúrgicos |
| `ATRAUMA` | Antecedentes Traumáticos |
| `ALERGIAS` | Alergias (medicamentos, alimentos, ambientales) |
| `GINECO_OBS` | Gineco-Obstétricos |
| `MEDICAMENTOS` | Medicamentos actuales/previos relevantes |
| `PERINATAL` | Antecedentes Perinatales (pediatría) |

Cada PUT crea un nuevo registro y marca `is_current=false` en el anterior (historial de cambios).

### Estados de problema (`patient_problems.status`)

`ACTIVE` | `INACTIVE` | `RESOLVED` | `CHRONIC`

Cada problema tiene `problem_number` auto-incremental por paciente (lista numerada de Weed) y campo opcional `icd10_code`.

## Módulos implementados (Fase 0 + Fase 1 parcial)

| Módulo | Archivos | Estado |
|---|---|---|
| Auth | `modules/auth/` | ✅ Completo |
| Patients | `modules/patients/` | ✅ Completo |
| Encounters + SOAP | `modules/encounters/` | ✅ Completo |
| Treatments + Schedule Engine | `modules/treatments/` | ✅ Completo |
| Vital Signs | `modules/vital-signs/` | ✅ Completo |
| Patient Problems (lista Weed) | `modules/patient-problems/` | ✅ Completo |
| Patient Background (antecedentes) | `modules/patient-background/` | ✅ Completo |
| Patient portal (passwordless) | — | 🔄 Fase 1 pendiente |
| Documents upload | — | 🔄 Fase 1 pendiente |
| Notifications | — | 🔄 Fase 2 |

## API

Base URL: `http://localhost:3001/api/v1`

Todos los endpoints del doctor requieren: `Authorization: Bearer <access_token>`

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/auth/register` | Crear tenant + doctor |
| POST | `/auth/login` | Login |
| POST | `/auth/refresh` | Rotar refresh token |
| POST | `/auth/logout` | Revocar sesión |
| GET | `/auth/me` | Perfil del doctor |
| GET | `/patients?q=` | Buscar pacientes (fuzzy) |
| POST | `/patients` | Crear paciente |
| GET | `/patients/:id` | Perfil + resumen |
| PATCH | `/patients/:id` | Actualizar datos |
| GET | `/patients/:id/encounters` | Historial de consultas |
| POST | `/patients/:id/encounters` | Abrir consulta |
| GET | `/encounters/:id` | Detalle de consulta |
| PATCH | `/encounters/:id` | Actualizar notas |
| POST | `/encounters/:id/close` | Cerrar consulta |
| POST | `/encounters/:id/treatments` | Crear plan de tratamiento |
| GET | `/treatments/:id` | Plan con medicamentos |
| POST | `/treatments/:id/activate` | Activar y generar eventos de dosis |
| PATCH | `/treatments/:id/suspend` | Suspender tratamiento |
| GET | `/treatments/:id/adherence` | Score de adherencia |
| POST | `/doses/:id/confirm` | Confirmar dosis tomada |
| POST | `/encounters/:id/vital-signs` | Registrar signos vitales |
| GET | `/encounters/:id/vital-signs` | Signos vitales del encuentro |
| GET | `/patients/:id/vital-signs` | Histórico de signos vitales |
| GET | `/patients/:id/problems` | Lista de problemas (Weed) |
| POST | `/patients/:id/problems` | Agregar problema |
| PATCH | `/problems/:id` | Actualizar estado/datos del problema |
| GET | `/patients/:id/background` | Antecedentes vigentes del paciente |
| PUT | `/patients/:id/background` | Crear/actualizar antecedente por categoría |

## Tests

```bash
npm run test --workspace=apps/backend   # 21 tests
```

Tests unitarios: `schedule.engine`, `errors`, `token.service`.
Tests de integración (BD real): pendientes Fase 2.
