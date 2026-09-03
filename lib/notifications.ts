export const VAPID_PUBLIC_KEY = 'BKf8OOYPJzn7K00RhdNgt87LCaR3PuiOHA8D8halTH7hifCfBOTRKrumKRpvjTixo5ewRSrN2rYnBgDambTBDlw'

export type NotificationDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type NotificationSchedule = Record<NotificationDay, string | null>

export const emptyNotificationSchedule: NotificationSchedule = {
  mon: null,
  tue: null,
  wed: null,
  thu: null,
  fri: null,
  sat: null,
  sun: null,
}

export function normalizeNotificationSchedule(value: unknown): NotificationSchedule {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return Object.fromEntries(
    (Object.keys(emptyNotificationSchedule) as NotificationDay[]).map((day) => {
      const raw = source[day]
      return [day, typeof raw === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : null]
    }),
  ) as NotificationSchedule
}

export function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)))
}
