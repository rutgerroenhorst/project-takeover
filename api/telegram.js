export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' })
    return
  }
  try {
    const { botToken, chatId, text } = req.body || {}
    if (!botToken || !chatId || !text) {
      res.status(400).json({ ok: false, error: 'Missing botToken, chatId or text' })
      return
    }
    const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true })
    })
    const data = await r.json()
    res.status(r.ok ? 200 : 400).json(data)
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || 'Telegram send failed' })
  }
}
