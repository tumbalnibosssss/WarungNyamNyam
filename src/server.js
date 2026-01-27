require('dotenv').config()
const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const multer = require('multer')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const app = express()
const PORT = 3000

// ===============================
// Supabase
// ===============================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ===============================
// Middleware
// ===============================
app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

// ===============================
// Multer (upload memory)
// ===============================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
})

// ===============================
// AUTH MIDDLEWARE
// ===============================
function authenticate(req, res, next) {
  const auth = req.headers.authorization
  if (!auth) return res.status(401).json({ error: 'No token' })

  const token = auth.split(' ')[1]

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

// ===============================
// ROUTE: ROOT FIX (Cannot GET /)
// ===============================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'))
})

// ===============================
// LOGIN
// ===============================
app.post('/api/login', (req, res) => {
  const { email, password } = req.body

  // Demo admin (bisa diganti DB nanti)
  if (email === 'admin@nyamnyam.com' && password === 'admin123') {
    const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '1d' })
    return res.json({ token })
  }

  res.status(401).json({ error: 'Email atau password salah' })
})

// ===============================
// PUBLIC MENU API
// ===============================
app.get('/api/menus', async (req, res) => {
  const { data, error } = await supabase
    .from('menus')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error })
  res.json(data)
})

app.get('/api/menus/best-seller', async (req, res) => {
  const { data, error } = await supabase
    .from('menus')
    .select('*')
    .eq('is_active', true)
    .eq('is_best_seller', true)

  if (error) return res.status(500).json({ error })
  res.json(data)
})

// ===============================
// ADMIN MENU API
// ===============================
app.get('/api/admin/menus', authenticate, async (req, res) => {
  const { data, error } = await supabase
    .from('menus')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error })
  res.json(data)
})

app.get('/api/admin/menus/:id', authenticate, async (req, res) => {
  const { data, error } = await supabase
    .from('menus')
    .select('*')
    .eq('id', req.params.id)
    .single()

  if (error) return res.status(404).json({ error: 'Menu tidak ditemukan' })
  res.json(data)
})

app.post('/api/admin/menus', authenticate, async (req, res) => {
  const { error } = await supabase.from('menus').insert([req.body])
  if (error) return res.status(500).json({ error })
  res.json({ success: true })
})

app.put('/api/admin/menus/:id', authenticate, async (req, res) => {
  const { error } = await supabase
    .from('menus')
    .update(req.body)
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error })
  res.json({ success: true })
})

app.delete('/api/admin/menus/:id', authenticate, async (req, res) => {
  const { error } = await supabase
    .from('menus')
    .delete()
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error })
  res.json({ success: true })
})

// ===============================
// UPLOAD IMAGE (SUPABASE STORAGE)
// ===============================
app.post('/api/upload-image', authenticate, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Tidak ada file yang diupload' })
    }

    const ext = req.file.originalname.split('.').pop()
    const filename = `menu-${Date.now()}.${ext}`

    const { error } = await supabase.storage
      .from('menu-images')
      .upload(filename, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true
      })

    if (error) {
      console.error(error)
      return res.status(500).json({ error: 'Gagal upload ke Supabase Storage' })
    }

    const { data } = supabase.storage
      .from('menu-images')
      .getPublicUrl(filename)

    res.json({ url: data.publicUrl })

  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Upload gagal' })
  }
})

// ===============================
// RUN SERVER
// ===============================
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})
