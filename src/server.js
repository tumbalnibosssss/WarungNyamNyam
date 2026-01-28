require('dotenv').config()
const express = require('express')
const path = require('path')
const multer = require('multer')
const { createClient } = require('@supabase/supabase-js')

// Inisialisasi App
const app = express()
const PORT = process.env.PORT || 3000

// =====================
// KONFIGURASI SUPABASE
// =====================
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)
const STORAGE_BUCKET = 'menu-images' // Nama bucket yang Anda buat

// =====================
// MIDDLEWARE
// =====================
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// 1. Serve File Publik (Customer) di root '/'
app.use(express.static(path.join(__dirname, '../public')))

// 2. Serve File Admin di '/admin'
// File ini dipisah agar struktur lebih rapi
app.use('/admin', express.static(path.join(__dirname, '../admin_panel')))

// =====================
// KONFIGURASI UPLOAD (MULTER)
// =====================
const upload = multer({
  storage: multer.memoryStorage(), // Simpan di RAM sementara sebelum ke Supabase
  limits: { fileSize: 5 * 1024 * 1024 }, // Batas 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('Hanya file gambar yang diperbolehkan!'))
    }
  }
})

// =====================
// AUTH MIDDLEWARE
// =====================
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: 'Token missing' })

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    return res.status(401).json({ error: 'Token invalid or expired' })
  }

  req.user = user
  next()
}

// =====================
// API: UPLOAD IMAGE (Supabase Storage)
// =====================
app.post('/api/upload-image', requireAuth, upload.single('image'), async (req, res) => {
  try {
    const file = req.file
    if (!file) return res.status(400).json({ error: 'No file uploaded' })

    // Buat nama file unik: timestamp-namaoriginal
    const fileName = `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`

    // Upload ke Supabase Storage
    const { data, error } = await supabase
      .storage
      .from(STORAGE_BUCKET)
      .upload(fileName, file.buffer, {
        contentType: file.mimetype
      })

    if (error) throw error

    // Ambil Public URL
    const { data: { publicUrl } } = supabase
      .storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(fileName)

    res.json({ url: publicUrl })

  } catch (err) {
    console.error('UPLOAD ERROR:', err)
    res.status(500).json({ error: 'Gagal mengupload gambar ke Supabase' })
  }
})

// =====================
// API: CONFIG (Untuk Login Frontend)
// =====================
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY
  })
})

// =====================
// API: PUBLIC MENUS
// =====================
app.get('/api/menus', async (req, res) => {
  const { data, error } = await supabase
    .from('menus')
    .select('*')
    .eq('is_active', true)
    .order('category', { ascending: true }) // Urutkan kategori biar rapi

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

app.get('/api/menus/best-seller', async (req, res) => {
  const { data, error } = await supabase
    .from('menus')
    .select('*')
    .eq('is_active', true)
    .eq('is_best_seller', true)
    .limit(4) // Batasi tampilan best seller

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// =====================
// API: ADMIN MENUS (Protected)
// =====================
app.get('/api/admin/menus', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('menus')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

app.get('/api/admin/menus/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('menus')
    .select('*')
    .eq('id', req.params.id)
    .single()

  if (error) return res.status(404).json({ error: 'Menu tidak ditemukan' })
  res.json(data)
})

app.post('/api/admin/menus', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('menus')
    .insert([req.body])
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  // Log Activity
  await logActivity(req.user.email, 'CREATE', null, data)

  res.json(data)
})

app.put('/api/admin/menus/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  
  // Ambil data lama untuk log
  const { data: beforeData } = await supabase.from('menus').select('*').eq('id', id).single()

  const { data, error } = await supabase
    .from('menus')
    .update(req.body)
    .eq('id', id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  // Log Activity
  await logActivity(req.user.email, 'UPDATE', beforeData, data)

  res.json(data)
})

// =====================
// API: ADMIN LOGS
// =====================
app.get('/api/admin/logs', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('menu_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// Helper Function: Log Activity
async function logActivity(userEmail, action, before, after) {
  try {
    await supabase.from('menu_logs').insert({
      menu_id: after?.id || before?.id,
      action: action,
      before_data: before,
      after_data: after,
      edited_by: userEmail
    })
  } catch (err) {
    console.error('Log error:', err)
  }
}

// =====================
// FALLBACK ROUTE
// =====================
// Jika rute tidak ditemukan, kirim index.html (untuk SPA) atau 404
// =====================
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'))
})

app.listen(PORT, () => {
  console.log(`🔥 Server Warung Nyam Nyam berjalan di http://localhost:${PORT}`)
  console.log(`📂 Admin Panel: http://localhost:${PORT}/admin/dashboard.html`)
})