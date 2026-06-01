import { Hono } from 'hono'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import icd10Data from '../../shared/data/icd10-es.json' with { type: 'json' }

interface Icd10Entry { code: string; description: string }

const catalog = icd10Data as Icd10Entry[]

// Normalize: lowercase + strip diacritics via Unicode decomposition
function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

const normalized = catalog.map(e => ({
  ...e,
  _norm: normalize(e.code + ' ' + e.description),
}))

const router = new Hono()

router.use('*', requireAuth)

router.get('/icd10/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim()
  if (!q || q.length < 2) return c.json({ success: true, data: [] })

  const terms = normalize(q).split(/\s+/).filter(Boolean)

  const results = normalized
    .filter(e => terms.every(t => e._norm.includes(t)))
    .slice(0, 10)
    .map(({ code, description }) => ({ code, description }))

  return c.json({ success: true, data: results })
})

export { router as icd10Router }
