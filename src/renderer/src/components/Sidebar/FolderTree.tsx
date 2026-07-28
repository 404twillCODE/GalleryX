import { useState } from 'react'
import { ChevronRight, Folder, FolderOpen, HardDrive, Upload } from 'lucide-react'
import clsx from 'clsx'
import { useAppStore } from '../../store/useAppStore'
import type { FolderNode } from '../../../../shared/types'

function FolderRow({ node, depth }: { node: FolderNode; depth: number }): JSX.Element {
  const [expanded, setExpanded] = useState(depth < 1)
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const isActive = view.kind === 'folder' && view.path === node.path
  const hasChildren = node.children.length > 0

  return (
    <div>
      <button
        onClick={() => setView({ kind: 'folder', path: node.path, driveId: node.driveId })}
        className={clsx(
          'w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm transition-colors duration-150 no-drag group',
          isActive ? 'bg-accent/15 text-accent' : 'text-neutral-300 hover:bg-white/[0.05] hover:text-white'
        )}
        style={{ paddingLeft: 6 + depth * 16 }}
      >
        <span
          className={clsx(
            'flex items-center justify-center w-4 h-4 flex-shrink-0 text-neutral-500 transition-transform',
            !hasChildren && 'opacity-0'
          )}
          onClick={(e) => {
            e.stopPropagation()
            setExpanded((v) => !v)
          }}
        >
          <ChevronRight size={13} className={clsx(expanded && 'rotate-90')} />
        </span>
        {depth === 0 ? (
          <HardDrive size={14} className="flex-shrink-0 text-neutral-500" />
        ) : isActive || expanded ? (
          <FolderOpen size={14} className="flex-shrink-0 text-neutral-500" />
        ) : (
          <Folder size={14} className="flex-shrink-0 text-neutral-500" />
        )}
        <span className="flex-1 text-left truncate">{node.name}</span>
        {node.hasExport && <Upload size={11} className="text-accent/70 flex-shrink-0" />}
        <span className="text-xs text-neutral-500 tabular-nums flex-shrink-0">
          {node.photoCount.toLocaleString()}
        </span>
      </button>
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <FolderRow key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export function FolderTree(): JSX.Element {
  const folderTree = useAppStore((s) => s.folderTree)

  if (!folderTree.length) return <div />

  return (
    <div className="space-y-0.5">
      <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-neutral-500">Folders</div>
      {folderTree.map((node) => (
        <FolderRow key={node.path} node={node} depth={0} />
      ))}
    </div>
  )
}
