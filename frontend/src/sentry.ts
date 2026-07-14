/**
 * Sentry initialisation — dynamically imported so it's a no-op when
 * VITE_SENTRY_DSN is not set (no bundle size impact).
 */

export function initSentry(dsn: string) {
  import("@sentry/react").then((Sentry) => {
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE, // "development" | "production"
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration(),
      ],
      // Capture 10% of transactions in dev, 100% in prod
      tracesSampleRate: import.meta.env.PROD ? 1.0 : 0.1,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
    });
  });
}
