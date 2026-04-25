import { useEffect } from 'react'

export function Toast({
  message,
  onClose,
}: {
  message: string
  onClose: () => void
}) {
  useEffect(() => {
    const timeout = window.setTimeout(onClose, 3200)
    return () => window.clearTimeout(timeout)
  }, [message, onClose])

  return (
    <div className="toast" role="status" aria-live="polite">
      <span>{message}</span>
      <button className="toast-close" onClick={onClose} aria-label="Close notification">x</button>
    </div>
  )
}
