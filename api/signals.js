// GET /api/signals  — returns the latest stored signals for the app dashboard.
import { listSignals, storageProvider } from './_signalStore.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed. Use GET.' })
    return
  }
  try {
    const limit = Math.max(1, Math.min(100, parseInt(req.query?.limit, 10) || 50))
    const signals = await listSignals(limit)
    res.status(200).json({ ok: true, storage: storageProvider(), count: signals.length, signals })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
}
