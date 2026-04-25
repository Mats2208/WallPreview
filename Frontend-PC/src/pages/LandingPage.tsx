import { Link } from 'react-router-dom'

const steps = [
  ['Capture', 'Start from a real wall photo and keep each image tied to the user account.'],
  ['Compose', 'Place shared utility assets on a clean canvas without duplicating the library.'],
  ['Persist', 'Save the layout as structured scene data and continue later.'],
  ['Deliver', 'Export the final composition as one preview image.'],
]

export function LandingPage() {
  return (
    <section className="landing-grid">
      <div className="hero-panel">
        <p className="eyebrow">Preview workspace for industrial designers</p>
        <h1 className="hero-title">Compose installation previews over real site photos.</h1>
        <p className="hero-copy">
          WallPreview is a web app for industrial designers to upload wall photos, place reusable utility assets,
          save work-in-progress layouts, and export client-ready visual previews.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link className="action-primary" to="/register">Create account</Link>
          <Link className="action-secondary" to="/login">Open demo workspace</Link>
        </div>
        <p className="mt-5 text-sm font-semibold text-[var(--muted)]">
          Demo admin: admin@wallpreview.local / Admin123!
        </p>
      </div>
      <div className="proof-stack">
        {steps.map(([title, text], index) => (
          <article className="proof-card" key={title}>
            <span className="proof-number">{String(index + 1).padStart(2, '0')}</span>
            <h2 className="text-2xl font-black tracking-tight">{title}</h2>
            <p className="mt-2 text-[var(--muted)]">{text}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
