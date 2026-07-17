import { Link } from "react-router-dom";
import { PageShell } from "../components/PageShell";

export default function Terms() {
  return (
    <PageShell>
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-heading font-bold text-ink-900">Terms of Service</h1>
        <p className="mt-2 text-sm text-ink-600">Last updated: July 2026</p>

        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>⚠ Medical Disclaimer:</strong> BCD (Breast Changes Detection) is an <strong>awareness and
          self-monitoring tool</strong>. It is NOT a medical device, does NOT diagnose any
          condition, and does NOT replace professional medical care. Always consult a
          qualified healthcare provider for any health concerns.
        </div>

        <section className="mt-8 space-y-6 text-ink-700 text-sm leading-relaxed">
          <div>
            <h2 className="text-lg font-semibold text-ink-900">1. Acceptance of Terms</h2>
            <p>By using BCD, you agree to these Terms of Service. If you do not agree, do not use the service.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink-900">2. Description of Service</h2>
            <p>BCD provides a visual self-monitoring platform that allows users to capture, store, and compare
            standardized 6-angle images over time. The platform uses machine learning to detect visual changes
            between sessions and generate change-tracking visualizations.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink-900">3. Not a Medical Device</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>BCD does not diagnose, treat, cure, or prevent any disease or medical condition</li>
              <li>BCD does not provide medical advice, recommendations, or clinical assessments</li>
              <li>BCD does not replace breast self-exams, clinical exams, mammograms, or any other medical screening</li>
              <li>Change scores and visualizations are for <strong>informational purposes only</strong></li>
              <li>Any visual changes detected should be discussed with a healthcare professional</li>
              <li>The ML model may produce inaccurate or misleading results and should never be used as the sole basis for health decisions</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink-900">4. AI Accuracy & Limitations</h2>
            <p>The machine learning model that powers BCD's change detection is an experimental tool. It is not clinically validated and may produce false positives, false negatives, or inconsistent results. The model's accuracy depends on image quality, consistent camera positioning, and lighting conditions. You acknowledge that:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Analysis results are estimates, not measurements</li>
              <li>The model has not been approved or cleared by any regulatory body (FDA, CE, CDSCO, etc.)</li>
              <li>You use the analysis at your own risk</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink-900">5. User Responsibilities</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Provide accurate account information</li>
              <li>Maintain the confidentiality of your login credentials</li>
              <li>Use the service responsibly and in accordance with applicable laws</li>
              <li>You must be at least 18 years old to use this service</li>
              <li>Not attempt to access other users' data</li>
              <li>Not upload images that contain nudity unrelated to the intended use of the service</li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink-900">6. Privacy & Data</h2>
            <p>Your use of BCD is governed by our <Link to="/privacy" className="text-blue-600 underline">Privacy Policy</Link>.
            You retain ownership of your images and data. We claim no intellectual property rights over your content.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink-900">6. Data Deletion</h2>
            <p>You can delete individual sessions from the History page. For full account deletion, contact us.
            Deletion requests are processed within <strong>30 days</strong> to allow for complete removal from
            storage systems, backups, and CDN caches.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink-900">7. Limitation of Liability</h2>
            <p>BCD is provided "as is" without any warranty, express or implied. The creators and maintainers
            of BCD shall not be liable for any damages arising from the use or inability to use the service,
            including but not limited to decisions made based on the data provided by the platform.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink-900">8. Changes to Terms</h2>
            <p>We reserve the right to modify these terms at any time. Users will be notified of material
            changes via the email address associated with their account.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink-900">10. Governing Law</h2>
            <p>These terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts of India.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink-900">11. Account Termination</h2>
            <p>We reserve the right to suspend or terminate accounts that violate these terms. You may stop using the service at any time. Upon termination, your data will be deleted in accordance with our Privacy Policy.</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-ink-900">12. Contact</h2>
            <p className="font-medium">muneer.alam320@gmail.com</p>
          </div>
        </section>

        <div className="mt-10 border-t border-tide-200 pt-6 text-center text-sm text-ink-600">
          <Link to="/privacy" className="text-blue-600 underline hover:text-blue-800">Privacy Policy</Link>
          <span className="mx-3">·</span>
          <Link to="/" className="text-blue-600 underline hover:text-blue-800">Home</Link>
        </div>
      </div>
    </PageShell>
  );
}
