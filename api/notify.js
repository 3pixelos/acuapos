// Vercel serverless function — sends a Web Push to every ADMIN device.
// Called by the client (notifyAdmins) when a table cancellation or a print
// authorisation is requested. Runs on Node; web-push holds the VAPID private
// key which never reaches the browser.
//
// Env vars (set in the Vercel project, NOT committed):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…)
//   SUPABASE_URL, SUPABASE_ANON_KEY
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

// Reuse the frontend's Supabase vars (already set in Vercel for the build)
// so only the VAPID vars are new.
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY,
)

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:2amstudio.contact@gmail.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  const { title, body, tag } = req.body || {}
  if (!title) return res.status(400).json({ error: 'title required' })

  // admin subscriptions only (inner join on the staff role)
  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, staff!inner(role)')
    .eq('staff.role', 'admin')
  if (error) return res.status(500).json({ error: error.message })

  const payload = JSON.stringify({ title, body: body || '', tag: tag || 'acua', url: '/' })

  const results = await Promise.allSettled(
    (subs || []).map((s) =>
      webpush
        .sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 3600 }, // queue up to 1h if the phone is briefly offline
        )
        .catch(async (err) => {
          // 404/410 = the subscription is dead (app uninstalled, etc.) → prune
          if (err.statusCode === 404 || err.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
          }
          throw err
        }),
    ),
  )

  const sent = results.filter((r) => r.status === 'fulfilled').length
  return res.status(200).json({ sent, total: subs?.length || 0 })
}
