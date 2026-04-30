import { fullUrl } from '../lib/api'
import { isObjAsset } from '../lib/model3d'
import type { Asset } from '../types/wallpreview'

export function AssetGrid({ assets }: { assets: Asset[] }) {
  if (!assets.length) {
    return <p className="mt-3 text-sm text-ink-muted">No assets uploaded yet.</p>
  }

  return (
    <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {assets.map((asset) => (
        <div className="asset-tile" key={asset.id}>
          {isObjAsset(asset.name, asset.public_url) ? (
            <div className="model-asset-preview">OBJ</div>
          ) : (
            <img className="h-24 w-full rounded-sm object-contain" src={fullUrl(asset.public_url)} alt={asset.name} />
          )}
          <p className="mt-2 truncate text-xs font-medium text-ink-secondary">{asset.name}</p>
        </div>
      ))}
    </div>
  )
}
