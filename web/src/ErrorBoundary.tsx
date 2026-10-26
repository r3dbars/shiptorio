import * as Sentry from "@sentry/react";
import type { ReactNode } from "react";
export function ErrorBoundary({ children }: { children: ReactNode }) {
  return <Sentry.ErrorBoundary fallback={<main role="alert" style={{ minHeight: '100vh', display: 'grid', placeContent: 'center', textAlign: 'center', background: '#1b2448', color: '#fff', padding: 24 }}>
    <h1>Something broke.</h1><p>Please reload to get back to your factory.</p><button onClick={() => location.reload()}>Reload</button>
  </main>}>{children}</Sentry.ErrorBoundary>;
}
