import { Link } from "react-router-dom";
import { PageShell } from "../components/PageShell";

export default function Privacy() {
  return (
    <PageShell>
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-heading font-bold text-ink-900">Privacy Policy</h1>
        <p className="mt-2 text-sm text-ink-600">Last updated: July 2026</p>

        <section className="mt-8 space-y-6 text-ink-700 text-sm leading-relaxed">
          <div>
            <h2 className="text-lg font-semibold text-ink-900">1. What We Collect</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><strong>Account information:</strong> Email address and password hash (via Supabase Auth). We never see your raw password.</li>
              <li><strong>Session images:</strong> Photos you upload during capture sessions. Stored in a private, encrypted-at-rest storage bucket.</li>
              <li><strong>Analysis results:</strong> ML-generated scores, embeddings, and comparison data derived from your images.</li>
              <li><strong>Usage metadata:</strong> Session timestamps, image counts, and basic interaction data for improving the service.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink-900">2. How We Use Your Data</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Generate personalized change-tracking visualizations and scores</li>
              <li>Compare current sessions against your own historical baseline</li>
              <li>Improve the ML model's accuracy and reliability</li>
              <li>Maintain and debug the service</li>
            </ul>
            <p className="mt-2"><strong>We do not</strong> sell, share, or publish your images or personal data. Your data is used exclusively for your personal tracking within the app.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink-900">3. Data Storage & Security</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><strong>Images:</strong> Stored in a private Supabase Storage bucket with Row-Level Security. Only you (and the backend service account) can access them.</li>
              <li><strong>Database:</strong> All records are isolated per user via RLS policies.</li>
              <li><strong>Encryption:</strong> Data is encrypted at rest by Supabase infrastructure and in transit via TLS 1.3.</li>
              <li><strong>Signed URLs:</strong> Image access URLs expire after 5 minutes and are never cached persistently on the client.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink-900">4. Data Retention & Deletion</h2>
            <p>You can delete individual sessions (including all associated images and analysis data) from the History page at any time.</p>
            <p className="mt-2">To request full account deletion, contact us at the email below. We will initiate the deletion process, which may take up to <strong>30 days</strong> to complete fully (including removal from backups and CDN caches).</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink-900">5. Third-Party Services</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><strong>Supabase</strong> — Authentication, database, and object storage. <a href="https://supabase.com/privacy" className="text-blue-600 underline" target="_blank" rel="noopener noreferrer">Supabase Privacy Policy</a></li>
              <li><strong>Vercel</strong> — Frontend hosting. <a href="https://vercel.com/legal/privacy" className="text-blue-600 underline" target="_blank" rel="noopener noreferrer">Vercel Privacy Policy</a></li>
              <li><strong>Hugging Face</strong> — Backend model serving. <a href="https://huggingface.co/privacy" className="text-blue-600 underline" target="_blank" rel="noopener noreferrer">HF Privacy Policy</a></li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink-900">6. Your Rights</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><strong>Access:</strong> View all your sessions and data through the app</li>
              <li><strong>Export:</strong> Screenshot or download your analysis results</li>
              <li><strong>Delete:</strong> Remove individual sessions or request full account deletion</li>
              <li><strong>Object:</strong> Stop using the service at any time</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink-900">7. Contact</h2>
            <p>For privacy-related inquiries or deletion requests:</p>
            <p className="mt-1 font-medium">muneer.alam320@gmail.com</p>
          </div>
        </section>

        <div className="mt-10 border-t border-tide-200 pt-6 text-center text-sm text-ink-600">
          <Link to="/terms" className="text-blue-600 underline hover:text-blue-800">Terms of Service</Link>
          <span className="mx-3">·</span>
          <Link to="/" className="text-blue-600 underline hover:text-blue-800">Home</Link>
        </div>
      </div>
    </PageShell>
  );
}
