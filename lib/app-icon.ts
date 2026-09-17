/**
 * The installed-app icon. Every PNG is rendered from `branding/ordly-icon.svg` by
 * `scripts/render-icons.mjs`. Bump the version after re-rendering: iOS and service workers cache
 * icons by URL, so an unchanged URL keeps serving the old art.
 */
export const APP_ICON_VERSION = 9

export type AppIconSize = 180 | 192 | 512 | 1024

export function appIconUrl(size: AppIconSize): string {
  const file = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`
  return `/${file}?v=${APP_ICON_VERSION}`
}
