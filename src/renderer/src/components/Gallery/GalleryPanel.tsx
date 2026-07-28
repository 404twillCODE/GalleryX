import { Toolbar } from './Toolbar'
import { GalleryGrid } from './GalleryGrid'
import type { GalleryPhotosState } from '../../hooks/useGalleryPhotos'

interface Props {
  gallery: GalleryPhotosState
}

export function GalleryPanel({ gallery }: Props): JSX.Element {
  return (
    <div className="flex-1 min-w-0 h-full flex flex-col bg-base-bg">
      <Toolbar total={gallery.total} />
      <GalleryGrid gallery={gallery} />
    </div>
  )
}
