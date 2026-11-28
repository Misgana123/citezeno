'use client';

import Link from 'next/link';
import type { ConnectorView } from '@/lib/connectors/catalog';
import { connectHref } from './api';
import { settingsHref } from '../settings/open';

/* "Connect <app>" where a feature needs an app that isn't connected (or
   stopped working): its sign-in, or Settings → Customize → Connectors for a key. */
export function ConnectPrompt({ app, back, children }: { app: ConnectorView; back: string; children?: React.ReactNode }) {
  const stale = app.connection?.status === 'needs_reconnect';
  return (
    <div className="conn-prompt">
      <p>{children ?? app.description}</p>
      {stale && <p className="small">The connection to {app.label} stopped working. Connect it again to carry on.</p>}
      {app.signIn ? (
        <a className="btn btn-sm" href={connectHref(app.name, back)}>
          {stale ? `Connect ${app.label} again` : `Connect ${app.label}`}
        </a>
      ) : (
        <Link className="btn btn-sm" href={settingsHref('customize', { kind: 'connectors' })}>
          Connect {app.label} in Settings
        </Link>
      )}
    </div>
  );
}
