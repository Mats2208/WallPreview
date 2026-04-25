import { fullUrl } from '../lib/api'
import type { Asset } from '../types/wallpreview'

export function AssetGrid({ assets }: { assets: Asset[] }) {
  if (!assets.length) {
    return <p className="mt-3 text-stone-500">No assets uploaded yet.</p>
  }

  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {assets.map((asset) => (
        <div className="asset-tile" key={asset.id}>
          <img className="h-24 w-full object-contain" src={fullUrl(asset.public_url)} alt={asset.name} />
          <p className="mt-2 truncate text-xs font-bold">{asset.name}</p>
        </div>
      ))}
    </div>
  )
}
