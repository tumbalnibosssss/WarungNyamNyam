require('dotenv').config()
const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const multer = require('multer')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

// ============================
// FORCE LOG ERROR (ANTI DIAM-DIAM CRASH)
// ============================
process.on('uncaughtException', err => {
  console.error('UNCAUGHT EXCEPTION:', err)
})

process.on('unhandledRejection', err => {
  console.error('UNHANDLED PROMISE:', err)
})

// ============================
const app = express()
const PORT = process.env.PORT || 3000

// ============================
// SUPABASE
// ============================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ============================
// MIDDLEWARE
// ============================
app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

// ============================
// MULTER (UPLOAD MEMORY)
// ============================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
})

// ============================
// AUTH MIDDLEWARE
// ============================
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

// ============================
// ROOT PAGE FIX
// ============================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'))
})

// ============================
// HEALTH CHECK (UNTUK CEK SERVER HIDUP)
// ============================
app.get('/health', (req, res) => {
  res.send('SERVER IS ALIVE')
})

// ============================
// LOGIN
// ============================
app.post('/api/login', (req, res) => {
  const { email, password } = req.body

  if (email === 'admin@nyamnyam.com' && password === 'admin123') {
    const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '1d' })
    return res.json({ token })
  }

  res.status(401).json({ error: 'Email atau password salah' })
})

// ============================
// PUBLIC MENU
// ============================
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

// ============================
// ADMIN MENU
// ============================
app.get('/api/admin/menus', authenticate, async (req, res) => {
  const { data, error } = await supabase.from('menus').select('*')
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

// ============================
// UPLOAD IMAGE (SUPABASE STORAGE)
// ============================
app.post('/api/upload-image', authenticate, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Tidak ada file' })
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
      return res.status(500).json({ error: 'Upload ke storage gagal' })
    }

    const { data } = supabase.storage
      .from('menu-images')
      .getPublicUrl(filename)

    res.json({ url: data.publicUrl })

  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Upload error' })
  }
})

// ============================
// START SERVER
// ============================
app.listen(PORT, () => {
  console.log('==============================')
  console.log('SERVER STARTED SUCCESSFULLY')
  console.log('PORT:', PORT)
  console.log('SUPABASE_URL OK:', !!process.env.SUPABASE_URL)
  console.log('JWT_SECRET OK:', !!process.env.JWT_SECRET)
  console.log('==============================')
})
