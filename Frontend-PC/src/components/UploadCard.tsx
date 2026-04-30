export function UploadCard({
  title,
  accept,
  note = 'PNG, JPG, WEBP, AVIF, GIF or HEIC',
  onFile,
}: {
  title: string
  accept: string
  note?: string
  onFile: (file: File) => void
}) {
  return (
    <label className="upload-card">
      <span>{title}</span>
      <span className="upload-card-note">{note}</span>
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
