import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createWriteStream, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'

const isConfigured =
  !!process.env.STORAGE_ENDPOINT &&
  !!process.env.STORAGE_ACCESS_KEY &&
  !!process.env.STORAGE_SECRET_KEY

const s3 = isConfigured
  ? new S3Client({
      endpoint: process.env.STORAGE_ENDPOINT,
      region: process.env.STORAGE_REGION ?? 'auto',
      credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY!,
        secretAccessKey: process.env.STORAGE_SECRET_KEY!,
      },
      // Required for R2 (path-style) and some S3-compatible providers
      forcePathStyle: !!process.env.STORAGE_FORCE_PATH_STYLE,
    })
  : null

const BUCKET = process.env.STORAGE_BUCKET ?? 'meditrack-files'
const LOCAL_UPLOADS_DIR = join(process.cwd(), 'uploads')

// ─── Upload ────────────────────────────────────────────────────────────────────

export async function uploadFile(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  if (s3) {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }))
  } else {
    // Local fallback: save to uploads/ directory
    const localPath = join(LOCAL_UPLOADS_DIR, key)
    const dir = dirname(localPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const { writeFileSync } = await import('fs')
    writeFileSync(localPath, body)
  }
}

// ─── Signed URL (for viewing) ──────────────────────────────────────────────────

export async function getSignedViewUrl(key: string, expiresInSeconds = 900): Promise<string> {
  if (s3) {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key })
    return getSignedUrl(s3, command, { expiresIn: expiresInSeconds })
  }
  // Local: return a local route that serves the file
  const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:3001'
  return `${backendUrl}/internal/files/${encodeURIComponent(key)}`
}

// ─── Delete ────────────────────────────────────────────────────────────────────

export async function deleteFile(key: string): Promise<void> {
  if (s3) {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
  } else {
    const { unlinkSync, existsSync: exists } = await import('fs')
    const localPath = join(LOCAL_UPLOADS_DIR, key)
    if (exists(localPath)) unlinkSync(localPath)
  }
}

// ─── Storage key builder ───────────────────────────────────────────────────────

export function buildStorageKey(
  tenantId: string,
  patientId: string,
  documentId: string,
  fileName: string,
): string {
  // Sanitize filename: keep extension, replace unsafe chars
  const ext = fileName.split('.').pop() ?? 'bin'
  return `${tenantId}/${patientId}/${documentId}.${ext}`
}
