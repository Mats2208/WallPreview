import { Link } from 'react-router-dom'

const steps: Array<[string, string]> = [
  ['Capture', 'Start from a real wall photo and keep each image tied to the user account.'],
  ['Compose', 'Place shared utility assets on a clean canvas without duplicating the library.'],
  ['Persist', 'Save the layout as structured scene data and continue later.'],
  ['Deliver', 'Export the final composition as one preview image.'],
]

export function LandingPage() {
  return (
    <section className="landing-grid">
      <div className="hero-panel">
        <h1 className="hero-title">Compose installation previews over real site photos.</h1>
        <p className="hero-copy">
          WallPreview is a workspace for industrial designers to upload wall photos, place reusable utility
          assets, save layouts, and export client-ready previews — without leaving the browser.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link className="action-primary" to="/register">Create account</Link>
          <Link className="action-secondary" to="/login">Open demo workspace</Link>
        </div>
        <p className="hero-meta">Demo admin · admin@wallpreview.local · Admin123!</p>
      </div>
      <div className="proof-stack">
        {steps.map(([title, text]) => (
          <article className="proof-card" key={title}>
            <h2 className="proof-title">{title}</h2>
            <p className="proof-text">{text}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
