'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, BellOff, Check, Clock3, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { LEARNER_LANGUAGE_NATIVE_NAMES, LEARNER_LANGUAGES, learnerLanguage } from '@/lib/learner-language'
import { emptyNotificationSchedule, normalizeNotificationSchedule, urlBase64ToUint8Array, VAPID_PUBLIC_KEY, type NotificationDay } from '@/lib/notifications'
import type { Profile, TranslationLanguage } from '@/lib/types'
import { useI18n } from './I18nProvider'

const days: NotificationDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export function SettingsHeader(): React.JSX.Element {
  const { t } = useI18n()
  return <header className="page-header"><div><span className="eyebrow">{t.settings.eyebrow}</span><h1>{t.settings.title}</h1><p>{t.settings.intro}</p></div></header>
}

type PermissionState = 'unsupported' | NotificationPermission

export function SettingsForm({ profile }: { profile: Profile & { current_streak?: number; longest_streak?: number } }): React.JSX.Element {
  const { t, setLanguage: setInterfaceLanguage } = useI18n()
  const router = useRouter()
  const [language, setLanguage] = useState<TranslationLanguage>(learnerLanguage(profile.default_translation_language))
  const [level, setLevel] = useState(profile.danish_level)
  const [limit, setLimit] = useState(profile.daily_new_limit)
  const [autoplayAudio, setAutoplayAudio] = useState(profile.autoplay_audio ?? false)
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
      autoplay_audio: autoplayAudio,
      due_notifications_enabled: dueNotifications,
      word_challenge_notifications_enabled: wordChallenges,
      notification_timezone: timezone,
      notification_schedule: schedule,
    }).eq('id', profile.id)
    setSaving(false)
    if (error) {
      setNotificationMessage(t.settings.couldNotSave)
      return
    }
    setSaved(true)
    // The whole interface follows the learner language (issue #24): client text switches now, and
    // the refresh re-renders server text. Saved meanings and Review are untouched.
    setInterfaceLanguage(language)
    router.refresh()
  }

  async function enableNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setPermission('unsupported')
      setNotificationMessage(t.settings.pushUnsupported)
      return
    }

    setNotificationBusy(true)
    setNotificationMessage(null)
    try {
      const nextPermission = await Notification.requestPermission()
      setPermission(nextPermission)
      if (nextPermission !== 'granted') {
        setNotificationMessage(nextPermission === 'denied' ? t.settings.blocked : t.settings.notGranted)
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
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error(t.settings.incomplete)

      const { error } = await createClient().from('push_subscriptions').upsert({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' })
      if (error) throw error

      setSubscribed(true)
      setNotificationMessage(t.settings.enabled)
    } catch (error) {
      setNotificationMessage(error instanceof Error && error.message === t.settings.incomplete ? error.message : t.settings.couldNotEnable)
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
      setNotificationMessage(t.settings.disabled)
    } catch (error) {
      setNotificationMessage(t.settings.couldNotDisable)
    } finally {
      setNotificationBusy(false)
    }
  }

  function toggleDay(day: NotificationDay, enabled: boolean) {
    setSchedule((current) => ({ ...current, [day]: enabled ? current[day] || '19:00' : null }))
  }

  return <section className="settings-card">
    <div className="setting-row"><div><strong>{t.settings.language}</strong><p>{t.settings.languageHelp}</p></div><select value={language} onChange={(e) => setLanguage(learnerLanguage(e.target.value))}>{LEARNER_LANGUAGES.map((code) => <option key={code} value={code} lang={code}>{LEARNER_LANGUAGE_NATIVE_NAMES[code]}</option>)}</select></div>
    <div className="setting-row"><div><strong>{t.settings.level}</strong><p>{t.settings.levelHelp}</p></div><select value={level} onChange={(e) => setLevel(e.target.value)}>{['A1','A2','B1','B2','C1'].map(x => <option key={x}>{x}</option>)}</select></div>
    <div className="setting-row"><div><strong>{t.settings.perDay}</strong><p>{t.settings.perDayHelp}</p></div><input className="number-input" type="number" min={1} max={50} value={limit} onChange={(e) => setLimit(Number(e.target.value))} /></div>
    <div className="setting-row"><div><strong>{t.settings.autoplay}</strong><p>{t.settings.autoplayHelp}</p></div><label className="setting-switch"><input type="checkbox" role="switch" checked={autoplayAudio} onChange={(e) => setAutoplayAudio(e.target.checked)} aria-label={t.settings.autoplay} /><span aria-hidden="true" /></label></div>

    <div className="notification-settings">
      <div className="notification-heading">
        <div><span className="eyebrow"><Bell size={14}/> {t.settings.notificationsEyebrow}</span><h3>{t.settings.notificationsTitle}</h3><p>{t.settings.notificationsHelp}</p></div>
        <button className={`soft-button ${subscribed ? 'notification-enabled' : ''}`} disabled={notificationBusy || permission === 'unsupported'} onClick={subscribed ? disableNotifications : enableNotifications}>
          {notificationBusy ? <Loader2 className="spin" size={16}/> : subscribed ? <BellOff size={16}/> : <Bell size={16}/>}
          {subscribed ? t.settings.disableHere : t.settings.enable}
        </button>
      </div>

      <div className="notification-options">
        <label className="notification-option">
          <input type="checkbox" checked={dueNotifications} onChange={(e) => setDueNotifications(e.target.checked)} />
          <span><strong>{t.settings.dueReminders}</strong><small>{t.settings.dueRemindersHelp}</small></span>
        </label>
        <label className="notification-option">
          <input type="checkbox" checked={wordChallenges} onChange={(e) => setWordChallenges(e.target.checked)} />
          <span><strong>{t.settings.challenges}</strong><small>{t.settings.challengesHelp}</small></span>
        </label>
      </div>

      <div className="mandatory-schedule">
        <div className="mandatory-title"><div><strong>{t.settings.mandatory}</strong><p>{t.settings.mandatoryHelp}</p></div><span><Clock3 size={14}/>{timezone}</span></div>
        <div className="schedule-grid">
          {days.map((key) => {
            const enabled = Boolean(schedule[key])
            return <div className={`schedule-row ${enabled ? 'enabled' : ''}`} key={key}>
              <label><input type="checkbox" checked={enabled} onChange={(e) => toggleDay(key, e.target.checked)} /><span>{t.settings.days[key]}</span></label>
              <input type="time" disabled={!enabled} value={schedule[key] || '19:00'} onChange={(e) => setSchedule((current) => ({ ...current, [key]: e.target.value }))} />
            </div>
          })}
        </div>
        <div className="notification-preview"><strong>{t.settings.exampleLabel}</strong><span>{t.settings.exampleTitle}</span><small>{t.settings.exampleBody}</small></div>
      </div>

      {notificationMessage && <div className="notification-message">{notificationMessage}</div>}
      {permission === 'unsupported' && <div className="notification-message warning">{t.settings.iosInstall}</div>}
      {permission === 'denied' && <div className="notification-message warning">{t.settings.permissionBlocked}</div>}
    </div>

    <div className="settings-note"><strong>{t.settings.scheduling}</strong><p>{t.settings.schedulingHelp}</p></div>
    <div style={{ padding: '18px 22px 22px' }}>
      <button className="primary-button" onClick={save} disabled={saving}>{saving ? <Loader2 className="spin" size={17}/> : saved ? <Check size={17}/> : null}{saved ? t.settings.saved : t.settings.saveSettings}</button>
    </div>
  </section>
}
