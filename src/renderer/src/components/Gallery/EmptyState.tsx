import { FolderPlus, ImageIcon } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'

export function EmptyState(): JSX.Element {
  const drives = useAppStore((s) => s.drives)
  const showScanOverlay = useAppStore((s) => s.showScanOverlay)

  const handleAddDrive = async (): Promise<void> => {
    const folder = await window.gx.chooseFolder()
    if (!folder) return
    const drive = await window.gx.addDrive(folder)
    if (drive) showScanOverlay(drive.id)
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
      <div className="w-16 h-16 rounded-2xl bg-white/[0.04] flex items-center justify-center">
        <ImageIcon size={28} className="text-neutral-600" />
      </div>
      <div className="text-white font-medium">
        {drives.length === 0 ? 'No drives added yet' : 'No photos match this view'}
      </div>
      <p className="text-sm text-neutral-500 max-w-sm">
        {drives.length === 0
          ? 'Choose a drive or folder to start indexing your photo library. GalleryX will scan it recursively and never move or modify your originals.'
          : 'Try a different folder, collection, or clear your search and filters.'}
      </p>
      {drives.length === 0 && (
        <button
          onClick={handleAddDrive}
          className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm transition-colors no-drag"
        >
          <FolderPlus size={15} />
          Choose Folder or Drive
        </button>
      )}
    </div>
  )
}
