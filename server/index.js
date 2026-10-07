import express from 'express'
import { dbPath, getStateRecord, updateState } from './db.js'

const app = express()
const port = Number(process.env.PORT || 3001)
const host = '0.0.0.0'

function isPrivateHost(hostname) {
  return (
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(hostname) ||
    hostname.endsWith('.ts.net')
  )
}

function isAllowedOrigin(origin) {
  if (!origin) {
    return true
  }

  try {
    const { hostname } = new URL(origin)
    return hostname === 'localhost' || hostname === '127.0.0.1' || isPrivateHost(hostname)
  } catch {
    return false
  }
}

app.use((req, res, next) => {
  const origin = req.headers.origin
  if (isAllowedOrigin(origin)) {
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  }

  if (req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }

  next()
})

app.use(express.json({ limit: '20mb' }))

function isValidStatePayload(payload) {
  return payload !== null && typeof payload === 'object' && !Array.isArray(payload)
}

function readState(res) {
  const record = getStateRecord()

  if (!record) {
    res.status(500).json({ error: 'App state record is missing.' })
    return null
  }

  try {
    return {
      state: JSON.parse(record.payload),
      updatedAt: record.updated_at
    }
  } catch (error) {
    console.error('Failed to parse app state JSON:', error)
    res.status(500).json({ error: 'Stored app state is invalid JSON.' })
    return null
  }
}

function writeState(nextState, res) {
  if (!isValidStatePayload(nextState)) {
    res.status(400).json({ error: 'Request body must be a JSON object.' })
    return null
  }

  try {
    const updatedAt = updateState(nextState)
    return { updatedAt }
  } catch (error) {
    console.error('Failed to update app state:', error)
    res.status(500).json({ error: 'Failed to write app state.' })
    return null
  }
}

app.get('/api/state', (req, res) => {
  const result = readState(res)
  if (!result) {
    return
  }
  res.json(result)
})

app.put('/api/state', (req, res) => {
  const result = writeState(req.body, res)
  if (!result) {
    return
  }
  res.json({ ok: true, updatedAt: result.updatedAt })
})

app.get('/api/backup/export', (req, res) => {
  const result = readState(res)
  if (!result) {
    return
  }
  res.json(result)
})

app.post('/api/backup/import', (req, res) => {
  const nextState = req.body?.state ?? req.body
  const result = writeState(nextState, res)
  if (!result) {
    return
  }
  res.json({ ok: true, updatedAt: result.updatedAt })
})

app.use((error, req, res, next) => {
  if (error?.type === 'entity.too.large') {
    res.status(413).json({ error: 'Request body is too large.' })
    return
  }

  if (
    error instanceof SyntaxError &&
    Object.prototype.hasOwnProperty.call(error, 'body')
  ) {
    res.status(400).json({ error: 'Request body must be valid JSON.' })
    return
  }

  next(error)
})

app.listen(port, host, () => {
  console.log(`Local backend listening on http://${host}:${port}`)
  console.log(`SQLite database: ${dbPath}`)
})
