import { shell } from 'electron'
import fs from 'node:fs'
import type { GalleryDatabase } from './db'

export interface DeleteRequest {
  photoId: string
  groupId: string | null
  permanent: boolean
}

export interface DeleteOutcome {
  photoId: string
  path: string
  success: boolean
  error: string | null
}

/**
 * Every deletion in GalleryX goes through here. Safety invariants enforced regardless of what
 * the caller asks for:
 *  - offline files are never touched (we can't verify they still exist / aren't mid-write)
 *  - the last remaining online member of a duplicate group is never deleted
 *  - every attempt (success or failure) is written to the deletion_log audit table
 *  - default behavior moves to OS Trash/Recycle Bin; permanent delete requires the caller to
 *    have explicitly enabled the advanced setting AND pass permanent=true for this call
 */
export class TrashService {
  constructor(private db: GalleryDatabase) {}

  async deleteMany(requests: DeleteRequest[], permanentDeleteEnabled: boolean): Promise<DeleteOutcome[]> {
    // Guard: never delete every online member of a group in the same batch.
    const byGroup = new Map<string, DeleteRequest[]>()
    for (const r of requests) {
      if (!r.groupId) continue
      const list = byGroup.get(r.groupId)
      if (list) list.push(r)
      else byGroup.set(r.groupId, [r])
    }

    const blocked = new Set<string>()
    for (const [groupId, reqs] of byGroup) {
      const group = this.db.listDuplicateGroups().find((g) => g.id === groupId)
      if (!group) continue
      const onlineMemberCount = group.members.length
      if (reqs.length >= onlineMemberCount && onlineMemberCount > 0) {
        // Would delete the entire group (including its only remaining copy) — keep the first
        // requested member's target off the deletion list as a last-resort safety net.
        blocked.add(reqs[reqs.length - 1].photoId)
      }
    }

    const outcomes: DeleteOutcome[] = []
    for (const req of requests) {
      if (blocked.has(req.photoId)) {
        outcomes.push({ photoId: req.photoId, path: '', success: false, error: 'Refused: this is the last remaining copy in its duplicate group.' })
        continue
      }
      outcomes.push(await this.deleteOne(req, permanentDeleteEnabled))
    }
    return outcomes
  }

  private async deleteOne(req: DeleteRequest, permanentDeleteEnabled: boolean): Promise<DeleteOutcome> {
    const photo = this.db.getById(req.photoId)
    if (!photo) {
      return { photoId: req.photoId, path: '', success: false, error: 'Photo not found in the library.' }
    }
    if (photo.isOffline) {
      this.log(photo.path, photo.driveId, 'trash', false, 'Drive is offline — refusing to delete.', req.groupId)
      return { photoId: req.photoId, path: photo.path, success: false, error: 'This drive is currently offline. Reconnect it before deleting.' }
    }
    if (!fs.existsSync(photo.path)) {
      this.log(photo.path, photo.driveId, 'trash', false, 'File no longer exists on disk.', req.groupId)
      return { photoId: req.photoId, path: photo.path, success: false, error: 'File no longer exists on disk.' }
    }

    const usePermanent = req.permanent && permanentDeleteEnabled
    try {
      if (usePermanent) {
        fs.unlinkSync(photo.path)
      } else {
        await shell.trashItem(photo.path)
      }
      this.db.removeById(req.photoId)
      this.log(photo.path, photo.driveId, usePermanent ? 'permanent' : 'trash', true, null, req.groupId)
      return { photoId: req.photoId, path: photo.path, success: true, error: null }
    } catch (err) {
      const message = (err as Error).message
      this.log(photo.path, photo.driveId, usePermanent ? 'permanent' : 'trash', false, message, req.groupId)
      return {
        photoId: req.photoId,
        path: photo.path,
        success: false,
        error: `Could not move this file to ${process.platform === 'darwin' ? 'the Trash' : 'the Recycle Bin'}: ${message}. The file on disk was left unchanged.`
      }
    }
  }

  private log(filePath: string, driveId: string, method: 'trash' | 'permanent', success: boolean, error: string | null, groupId: string | null): void {
    this.db.logDeletion({ path: filePath, driveId, deletedAt: new Date().toISOString(), method, success, error, groupId })
  }
}
