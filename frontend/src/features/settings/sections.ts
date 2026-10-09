/** The settings pages, in order. `admin`: only server admins see them. */
export const SETTINGS_SECTIONS = [
  { to: '/settings/profile', label: 'Profile & account', admin: false },
  { to: '/settings/api-keys', label: 'API keys', admin: false },
  { to: '/settings/reminders', label: 'Reminders', admin: false },
  { to: '/settings/import-export', label: 'Import / export', admin: false },
  { to: '/settings/appearance', label: 'Appearance', admin: false },
  { to: '/settings/about', label: 'About', admin: false },
  { to: '/settings/users', label: 'Users', admin: true },
  { to: '/settings/invites', label: 'Invite links', admin: true },
] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]
