import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const trashItem = vi.fn(async () => undefined)
vi.mock('electron', () => ({ shell: { trashItem } }))

// Imported dynamically after the mock is registered so `trashService.ts`'s
// `import { shell } from 'electron'` resolves to our fake implementation.
const { TrashService } = await import('../src/main/trashService')
const { GalleryDatabase } = await import('../src/main/db')

describe('TrashService safety invariants', () => {
  let dir: string
  let db: InstanceType<typeof GalleryDatabase>
  let trash: InstanceType<typeof TrashService>

  beforeEach(() => {
    trashItem.mockClear()
    trashItem.mockImplementation(async () => undefined)
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'galleryx-trash-'))
    db = new GalleryDatabase(path.join(dir, 'library.sqlite'))
    trash = new TrashService(db)
  })

  afterEach(() => {
    db.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  function addPhoto(driveRoot: string, filename: string): { id: string; path: string } {
    const drive = db.listDrives().find((d) => d.rootPath === driveRoot) ?? db.addDrive(driveRoot, 'Drive')
    const filePath = path.join(driveRoot, filename)
    db.upsertBaseline({
      driveId: drive.id,
      path: filePath,
      folderPath: driveRoot,
      filename,
      extension: 'jpg',
      sizeBytes: 10,
      mediaType: 'image',
      dateCreated: null,
      dateModified: null,
      mtimeMs: 1,
      isExport: false,
      exportFolderName: null,
      fingerprint: filename
    })
    const photo = db.getByPath(filePath)!
    return { id: photo.id, path: photo.path }
  }

  it('moves a normal online file to the OS trash and logs success', async () => {
    fs.writeFileSync(path.join(dir, 'keep-dir-online'), '')
    const photo = addPhoto(dir, 'a.jpg')
    fs.writeFileSync(photo.path, 'data')

    const outcomes = await trash.deleteMany([{ photoId: photo.id, groupId: null, permanent: false }], false)
    expect(outcomes[0].success).toBe(true)
    expect(trashItem).toHaveBeenCalledWith(photo.path)
    expect(db.getById(photo.id)).toBeUndefined()

    const log = db.listDeletionLog()
    expect(log[0].success).toBe(true)
    expect(log[0].method).toBe('trash')
  })

  it('refuses to delete a file on an offline drive', async () => {
    const photo = addPhoto('/this/path/does/not/exist/at/all', 'offline.jpg')
    const outcomes = await trash.deleteMany([{ photoId: photo.id, groupId: null, permanent: false }], false)
    expect(outcomes[0].success).toBe(false)
    expect(outcomes[0].error).toMatch(/offline/i)
    expect(trashItem).not.toHaveBeenCalled()
    // The record must remain in the library — offline files are never removed from the DB.
    expect(db.getById(photo.id)).toBeDefined()
  })

  it('refuses to delete every remaining online member of a duplicate group in one batch', async () => {
    const a = addPhoto(dir, 'dup-a.jpg')
    const b = addPhoto(dir, 'dup-b.jpg')
    fs.writeFileSync(a.path, 'x')
    fs.writeFileSync(b.path, 'x')

    const groupId = db.createDuplicateGroup('session-1', 'exact')
    db.addDuplicateGroupMember(groupId, a.id, null, false)
    db.addDuplicateGroupMember(groupId, b.id, null, false)

    const outcomes = await trash.deleteMany(
      [
        { photoId: a.id, groupId, permanent: false },
        { photoId: b.id, groupId, permanent: false }
      ],
      false
    )
    const succeeded = outcomes.filter((o) => o.success)
    const blocked = outcomes.filter((o) => !o.success)
    // Exactly one of the two must be blocked so at least one copy always survives.
    expect(succeeded.length).toBe(1)
    expect(blocked.length).toBe(1)
    expect(blocked[0].error).toMatch(/last remaining copy/i)
  })

  it('allows deleting all-but-one member of a duplicate group', async () => {
    const a = addPhoto(dir, 'dup-a2.jpg')
    const b = addPhoto(dir, 'dup-b2.jpg')
    const c = addPhoto(dir, 'dup-c2.jpg')
    for (const p of [a, b, c]) fs.writeFileSync(p.path, 'x')

    const groupId = db.createDuplicateGroup('session-2', 'exact')
    for (const p of [a, b, c]) db.addDuplicateGroupMember(groupId, p.id, null, false)

    const outcomes = await trash.deleteMany(
      [
        { photoId: a.id, groupId, permanent: false },
        { photoId: b.id, groupId, permanent: false }
      ],
      false
    )
    expect(outcomes.every((o) => o.success)).toBe(true)
    expect(db.getById(c.id)).toBeDefined()
  })

  it('does not permanently delete unless the caller both opts in AND the advanced setting is enabled', async () => {
    const photo = addPhoto(dir, 'perm.jpg')
    fs.writeFileSync(photo.path, 'data')

    await trash.deleteMany([{ photoId: photo.id, groupId: null, permanent: true }], false)
    // permanentDeleteEnabled=false at the call site -> must still go through the normal trash path.
    expect(trashItem).toHaveBeenCalledWith(photo.path)
  })

  it('logs a failed deletion attempt without touching the file when trashItem throws', async () => {
    trashItem.mockImplementationOnce(async () => {
      throw new Error('External drive does not support the Trash')
    })
    const photo = addPhoto(dir, 'fails.jpg')
    fs.writeFileSync(photo.path, 'data')

    const outcomes = await trash.deleteMany([{ photoId: photo.id, groupId: null, permanent: false }], false)
    expect(outcomes[0].success).toBe(false)
    expect(fs.existsSync(photo.path)).toBe(true)
    expect(db.getById(photo.id)).toBeDefined()
    const log = db.listDeletionLog()
    expect(log[0].success).toBe(false)
  })
})
