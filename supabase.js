import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

// ── Image helpers ────────────────────────────────────────────
const BUCKET = 'tenant-media'

/** Resize a File client-side, then upload to Supabase Storage.
 *  Returns the public URL string, or null on error. */
export async function uploadImage(file, path) {
  // Resize first to keep uploads small
  const blob = await resizeBlob(file, 520, 380, 0.68)
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true })
  if (error) { console.error('Upload error:', error); return null }
  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return publicUrl
}

/** Delete a file from Supabase Storage by its URL. */
export async function deleteImage(url) {
  if (!url) return
  const path = url.split(`/${BUCKET}/`)[1]
  if (path) await supabase.storage.from(BUCKET).remove([path])
}

function resizeBlob(file, maxW, maxH, quality) {
  return new Promise(res => {
    const reader = new FileReader()
    reader.onload = e => {
      const img = new Image()
      img.onload = () => {
        const r = Math.min(maxW / img.width, maxH / img.height, 1)
        const c = document.createElement('canvas')
        c.width  = Math.round(img.width  * r)
        c.height = Math.round(img.height * r)
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
        c.toBlob(blob => res(blob), 'image/jpeg', quality)
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}
