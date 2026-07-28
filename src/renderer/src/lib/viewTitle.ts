import type { ViewId } from '../../../shared/types'

function basename(p: string): string {
  const clean = p.replace(/[\\/]+$/, '')
  const idx = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'))
  return idx >= 0 ? clean.slice(idx + 1) : clean
}

export function viewTitle(view: ViewId): string {
  switch (view.kind) {
    case 'all':
      return 'All Photos'
    case 'videos':
      return 'Videos'
    case 'favorites':
      return 'Favorites'
    case 'exports':
      return 'Exports'
    case 'recent':
      return 'Recently Added'
    case 'folder':
      return basename(view.path) || view.path
    case 'search':
      return `Search: "${view.query}"`
    case 'timeline':
      return 'Timeline'
    default:
      return 'Photos'
  }
}
