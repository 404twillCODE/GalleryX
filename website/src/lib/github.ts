/** Canonical GitHub URLs for the marketing site — keep Source + Download in sync here. */
export const GITHUB_REPO = 'https://github.com/404twillCODE/GalleryX'
export const GITHUB_RELEASES = `${GITHUB_REPO}/releases/latest`
export const GITHUB_SOURCE = GITHUB_REPO

/** Direct asset URLs for the current release. Updated when tagging a new version. */
export const DOWNLOAD_MAC_ARM64 = `${GITHUB_REPO}/releases/download/v0.1.0/GalleryX-0.1.0-mac-arm64.dmg`
export const DOWNLOAD_MAC_X64 = `${GITHUB_REPO}/releases/download/v0.1.0/GalleryX-0.1.0-mac-x64.dmg`
/** Windows installer is produced by CI on windows-latest; until then /releases/latest lists all assets. */
export const DOWNLOAD_WIN = GITHUB_RELEASES
