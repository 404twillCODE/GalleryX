/// <reference types="vite/client" />

import type { GalleryApi } from '../../shared/ipc'

declare global {
  interface Window {
    gx: GalleryApi
  }
}

export {}
