import Store from 'electron-store'
import { app } from 'electron'
import path from 'node:path'
import type { Settings } from '../shared/types'

const defaults: Settings = {
  thumbnailSize: 220,
  cacheSizeLimitMB: 4096,
  cacheLocation: path.join(app.getPath('userData'), 'thumbnail-cache'),
  databaseLocation: path.join(app.getPath('userData'), 'galleryx.db'),
  autoRescan: true,
  autoRescanIntervalMinutes: 30,
  rawSupport: true,
  scanSubfolders: true,
  watchForChanges: true,
  theme: 'dark'
}

class SettingsService {
  private store = new Store<Settings>({
    name: 'settings',
    defaults
  })

  getAll(): Settings {
    return { ...defaults, ...(this.store.store as Partial<Settings>) }
  }

  get<K extends keyof Settings>(key: K): Settings[K] {
    return this.getAll()[key]
  }

  set(partial: Partial<Settings>): Settings {
    for (const [k, v] of Object.entries(partial)) {
      this.store.set(k as keyof Settings, v as never)
    }
    return this.getAll()
  }
}

export const settingsService = new SettingsService()
