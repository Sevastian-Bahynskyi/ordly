'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff, Check, Clock3, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { emptyNotificationSchedule, normalizeNotificationSchedule, urlBase64ToUint8Array, VAPID_PUBLIC_KEY, type NotificationDay } from '@/lib/notifications'
import type { Profile } from '@/lib/types'

const days: { key: NotificationDay; label: string }[] = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
]

type PermissionState = 'unsupported' | NotificationPermission

export function SettingsForm({ profile }: { profile: Profile & { current_streak?: number; longest_streak?: number } }) {
  const [language, setLanguage] = useState(profile.default_translation_language)
  const [level, setLevel] = useState(profile.danish_level)
  const [limit, setLimit] = useState(profile.daily_new_limit)
  const [dueNotifications, setDueNotifications] = useState(profile.due_notifications_enabled ?? true)
  const [wordChallenges, setWordChallenges] = useState(profile.word_challenge_notifications_enabled ?? true)
  const [schedule, setSchedule] = useState(() => normalizeNotificationSchedule(profile.notification_schedule || emptyNotificationSchedule))
  const [timezone, setTimezone] = useState(profile.notification_timezone || 'Europe/Copenhagen')
  const [permission, setPermission] = useState<PermissionState>('default')
  const [subscribed, setSubscribed] = useState(false)
  const [notificationBusy, setNotificationBusy] = useState(false)
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (detectedTimezone) setTimezone(detectedTimezone)

    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setPermission('unsupported')
      return
    }

    setPermission(Notification.permission)
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setSubscribed(Boolean(subscription)))
      .catch(() => {})
  }, [])

  async function save() {
    setSaving(true)
    setSaved(false)
    const { error } = await createClient().from('profiles').update({
      default_translation_language: language,
      danish_level: level,
      daily_new_limit: limit,
      due_notifications_enabled: dueNotifications,
      word_challenge_notifications_enabled: wordChallenges,
      notification_timezone: timezone,
      notification_schedule: schedule,
    }).eq('id', profile.id)
    setSaving(false)
    if (!error) setSaved(true)
  }

  async function enableNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setPermission('unsupported')
      setNotificationMessage('Push notifications are not supported in this browser. On iPhone, install Ordly to the Home Screen first.')
      return
    }

    setNotificationBusy(true)
    setNotificationMessage(null)
    try {
      const nextPermission = await Notification.requestPermission()
      setPermission(nextPermission)
      if (nextPermission !== 'granted') {
        setNotificationMessage(nextPermission === 'denied' ? 'Notifications are blocked in system/browser settings.' : 'Notification permission was not granted.')
        return
      }

      const registration = await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
      }

      const json = subscription.toJSON()
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error('The browser returned an incomplete push subscription.')

      const { error } = await createClient().from('push_subscriptions').upsert({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' })
      if (error) throw error

      setSubscribed(true)
      setNotificationMessage('Notifications are enabled on this device.')
    } catch (error) {
      setNotificationMessage(error instanceof Error ? error.message : 'Could not enable notifications.')
    } finally {
      setNotificationBusy(false)
    }
  }

  async function disableNotifications() {
    if (!('serviceWorker' in navigator)) return
    setNotificationBusy(true)
    setNotificationMessage(null)
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        const endpoint = subscription.endpoint
        await subscription.unsubscribe()
        await createClient().from('push_subscriptions').delete().eq('endpoint', endpoint)
      }
      setSubscribed(false)
      setNotificationMessage('Notifications are disabled on this device.')
    } catch (error) {
      setNotificationMessage(error instanceof Error ? error.message : 'Could not disable notifications.')
    } finally {
      setNotificationBusy(false)
    }
  }

  function toggleDay(day: NotificationDay, enabled: boolean) {
    setSchedule((current) => ({ ...current, [day]: enabled ? current[day] || '19:00' : null }))
  }

  return <section className="settings-card">
    <div className="setting-row"><div><strong>Translation language</strong><p>Used by AI and review prompts.</p></div><select value={language} onChange={(e) => setLanguage(e.target.value as typeof language)}><option value="ru">Russian</option><option value="en">English</option><option value="uk">Ukrainian</option></select></div>
    <div className="setting-row"><div><strong>Current Danish level</strong><p>AI sentences stay understandable without becoming childish.</p></div><select value={level} onChange={(e) => setLevel(e.target.value)}>{['A1','A2','B1','B2','C1'].map(x => <option key={x}>{x}</option>)}</select></div>
    <div className="setting-row"><div><strong>New words per day</strong><p>Due reviews are always shown first.</p></div><input className="number-input" type="number" min={1} max={50} value={limit} onChange={(e) => setLimit(Number(e.target.value))} /></div>

    <div className="notification-settings">
      <div className="notification-heading">
        <div><span className="eyebrow"><Bell size={14}/> NOTIFICATIONS</span><h3>Keep Danish from slipping.</h3><p>Ordly can notify you even when the installed web app is closed.</p></div>
        <button className={`soft-button ${subscribed ? 'notification-enabled' : ''}`} disabled={notificationBusy || permission === 'unsupported'} onClick={subscribed ? disableNotifications : enableNotifications}>
          {notificationBusy ? <Loader2 className="spin" size={16}/> : subscribed ? <BellOff size={16}/> : <Bell size={16}/>}
          {subscribed ? 'Disable on this device' : 'Enable notifications'}
        </button>
      </div>

      <div className="notification-options">
        <label className="notification-option">
          <input type="checkbox" checked={dueNotifications} onChange={(e) => setDueNotifications(e.target.checked)} />
          <span><strong>Due review reminders</strong><small>Notify when FSRS has genuine reviews waiting. Cooldowns prevent repeated spam.</small></span>
        </label>
        <label className="notification-option">
          <input type="checkbox" checked={wordChallenges} onChange={(e) => setWordChallenges(e.target.checked)} />
          <span><strong>Occasional word challenges</strong><small>Every few days, Ordly picks a weak/important learned word and asks something like “What is the translation of synes?”</small></span>
        </label>
      </div>

      <div className="mandatory-schedule">
        <div className="mandatory-title"><div><strong>Mandatory study reminder</strong><p>Only fires on the days and times you choose. It is intentionally hard to ignore.</p></div><span><Clock3 size={14}/>{timezone}</span></div>
        <div className="schedule-grid">
          {days.map(({ key, label }) => {
            const enabled = Boolean(schedule[key])
            return <div className={`schedule-row ${enabled ? 'enabled' : ''}`} key={key}>
              <label><input type="checkbox" checked={enabled} onChange={(e) => toggleDay(key, e.target.checked)} /><span>{label}</span></label>
              <input type="time" disabled={!enabled} value={schedule[key] || '19:00'} onChange={(e) => setSchedule((current) => ({ ...current, [key]: e.target.value }))} />
            </div>
          })}
        </div>
        <div className="notification-preview"><strong>Example</strong><span>🚨🇩🇰 DANISH TIME — OPEN ORDLY NOW!</span><small>12 reviews are waiting. DON'T SKIP TODAY.</small></div>
      </div>

      {notificationMessage && <div className="notification-message">{notificationMessage}</div>}
      {permission === 'unsupported' && <div className="notification-message warning">On iPhone/iPad, Web Push requires Ordly to be installed as a Home Screen web app.</div>}
      {permission === 'denied' && <div className="notification-message warning">Notification permission is blocked. Re-enable Ordly in your browser/system notification settings.</div>}
    </div>

    <div className="settings-note"><strong>Scheduling</strong><p>FSRS controls review timing automatically. You rate each review as Again, Hard, Good, or Easy.</p></div>
    <div style={{ padding: '18px 22px 22px' }}>
      <button className="primary-button" onClick={save} disabled={saving}>{saving ? <Loader2 className="spin" size={17}/> : saved ? <Check size={17}/> : null}{saved ? 'Saved' : 'Save settings'}</button>
    </div>
  </section>
}
