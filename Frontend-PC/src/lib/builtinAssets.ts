import type { Asset } from '../types/wallpreview'

export const BUILTIN_STANDARD_ASSET: Asset = {
  id: -1,
  kind: 'UTILITY',
  name: 'standar1.obj',
  public_url: '/assets/standar1.obj',
}

export function withBuiltinUtilities(assets: Asset[]) {
  const utilities = assets.filter((asset) => asset.kind === 'UTILITY')
  const hasStandard = utilities.some((asset) => asset.name.toLowerCase() === BUILTIN_STANDARD_ASSET.name)
  return hasStandard ? utilities : [BUILTIN_STANDARD_ASSET, ...utilities]
}
