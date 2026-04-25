export function UploadCard({
  title,
  accept,
  onFile,
}: {
  title: string
  accept: string
  onFile: (file: File) => void
}) {
  return (
    <label className="upload-card">
      <span>{title}</span>
      <span className="mt-1 text-xs text-stone-500">PNG, JPG, WEBP, AVIF, GIF or HEIC</span>
      <input
        className="hidden"
        type="file"
        accept={accept}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) {
            onFile(file)
          }
        }}
      />
    </label>
  )
}
