require('dotenv').config()

const express = require('express')
const path = require('path')
const multer = require('multer')
const axios = require('axios')
const FormData = require('form-data')
const { createClient } = require('@supabase/supabase-js')

const app = express()
const PORT = process.env.PORT || 3000

// =====================
// Supabase
// =====================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// =====================
// Middleware
// =====================
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static(path.join(__dirname, '../public')))

// =====================
// Multer
// =====================
const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
})

// =====================
// Auth middleware
// =====================
async function requireAuth(req, res, next) {
  const auth = req.headers.authorization
  if (!auth) return res.status(401).json({ error: 'No token' })

  const token = auth.replace('Bearer ', '')

  const { data, error } = await supabase.auth.getUser(token)

  if (error || !data?.user) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  req.user = data.user
  next()
}

// =====================
// Config for frontend
// =====================
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY
  })
})

// =====================
// Upload image to ImgBB
// =====================
app.post('/api/upload-image', requireAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const form = new FormData()
    form.append('image', req.file.buffer.toString('base64'))

    const response = await axios.post(
      `https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`,
      form,
      { headers: form.getHeaders() }
    )

    if (!response.data.success) {
      return res.status(500).json({ error: 'Upload to ImgBB failed' })
    }

    res.json({ url: response.data.data.url })
  } catch (err) {
    console.error('UPLOAD ERROR:', err.message)
    res.status(500).json({ error: 'Upload error' })
  }
})

// =====================
// PUBLIC API
// =====================
app.get('/api/menus', async (req, res) => {
  const { data, error } = await supabase
    .from('menus')
    .select('*')
    .eq('is_active', true)
    .order('category')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

app.get('/api/menus/best-seller', async (req, res) => {
  const { data, error } = await supabase
    .from('menus')
    .select('*')
    .eq('is_active', true)
    .eq('is_best_seller', true)

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// =====================
// ADMIN - MENUS
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
  const { id } = req.params

  const { data, error } = await supabase
    .from('menus')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return res.status(404).json({ error: 'Menu not found' })
  res.json(data)
})

app.post('/api/admin/menus', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('menus')
    .insert([req.body])
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  // Audit log
  await supabase.from('menu_logs').insert({
    menu_id: data.id,
    action: 'CREATE',
    after_data: data,
    edited_by: req.user.email
  })

  res.json(data)
})

app.put('/api/admin/menus/:id', requireAuth, async (req, res) => {
  const { id } = req.params

  const before = await supabase
    .from('menus')
    .select('*')
    .eq('id', id)
    .single()

  const { data, error } = await supabase
    .from('menus')
    .update(req.body)
    .eq('id', id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  // Audit log
  await supabase.from('menu_logs').insert({
    menu_id: id,
    action: 'UPDATE',
    before_data: before.data,
    after_data: data,
    edited_by: req.user.email
  })

  res.json(data)
})

// =====================
// ADMIN - AUDIT LOGS
// =====================
app.get('/api/admin/logs', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('menu_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) return res.status(500).json({ error: error.message })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// =====================
// Frontend fallback
// =====================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'))
})

// =====================
app.listen(PORT, () => {
  console.log(`🔥 Server running at http://localhost:${PORT}`)
})
