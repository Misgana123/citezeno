'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../Icon';
import type { SettingsSection, SettingsTarget } from './open';
import { useAccount } from './useAccount';
import { AccountSection } from './sections/AccountSection';
import { AppearanceSection } from './sections/AppearanceSection';
import { LabSection } from './sections/LabSection';
import { LibrarySection } from './sections/LibrarySection';
import { SecuritySection } from './sections/SecuritySection';
import { UsageSection } from './sections/UsageSection';
import { CustomizeSection } from './customize/CustomizeSection';

/* The Settings window: its sections on the left (with a search), the chosen
   one on the right. Everything that used to be the account page lives here. */

type NavItem = { id: SettingsSection; label: string; icon: IconName; words: string };

const NAV: (NavItem | 'sep')[] = [
  { id: 'account', label: 'Account', icon: 'user', words: 'account profile name email delete' },
  { id: 'usage', label: 'Credits and usage', icon: 'gauge', words: 'usage credits billing plan top up receipts invoice history limits' },
  { id: 'lab', label: 'Lab', icon: 'users', words: 'lab team group members invite workspace share seats caps' },
  'sep',
  { id: 'appearance', label: 'Appearance', icon: 'palette', words: 'appearance theme dark light system' },
  { id: 'library', label: 'Library', icon: 'book', words: 'library traces citation studio' },
  { id: 'security', label: 'Security', icon: 'shield', words: 'security sign-in password two-step 2fa devices sessions google github' },
  'sep',
  { id: 'customize', label: 'Customize', icon: 'sliders', words: 'customize skills instructions' },
];

export function SettingsDialog({ target, onClose }: { target: SettingsTarget; onClose(): void }) {
  const [section, setSection] = useState<SettingsSection>(target.section);
  const [find, setFind] = useState('');
  const account = useAccount();
  const box = useRef<HTMLDivElement>(null);
  const pane = useRef<HTMLDivElement>(null);

  // asked again while open (another Manage / Browse)
  useEffect(() => setSection(target.section), [target]);
  useEffect(() => {
    pane.current?.scrollTo(0, 0);
  }, [section]);

  // focus moves into the dialog, and back where it was when it closes
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const esc = (e: KeyboardEvent) => {
      // a menu inside handles its own Escape first
      if (e.key === 'Escape' && !e.defaultPrevented) onClose();
    };
    document.addEventListener('keydown', esc);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', esc);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [onClose]);

  const q = find.trim().toLowerCase();
  const shown = NAV.filter((n): n is NavItem => n !== 'sep' && (!q || n.words.includes(q) || n.label.toLowerCase().includes(q)));

  let body: ReactNode;
  if (section === 'customize') body = <CustomizeSection view={target.view} key={target.view ?? 'discover'} />;
  else if (section === 'appearance') body = <AppearanceSection />;
  else if (!account.data) body = <div className="st-loading">{account.error ?? 'Loading…'}</div>;
  else if (section === 'account') body = <AccountSection account={account} />;
  else if (section === 'usage') body = <UsageSection account={account} />;
  else if (section === 'lab') body = <LabSection userId={account.data.user.id} />;
  else if (section === 'library') body = <LibrarySection account={account} onClose={onClose} />;
  else body = <SecuritySection account={account} />;

  return (
    <div className="st-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="st" role="dialog" aria-modal="true" aria-labelledby="st-title" tabIndex={-1} ref={box}>
        <div className="st-top">
          <h2 id="st-title">Settings</h2>
          <button type="button" className="st-ib" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="st-body">
          <nav className="st-nav" aria-label="Settings sections">
            <label className="st-find">
              <Icon name="search" />
              <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search" aria-label="Search settings" />
            </label>
            {q
              ? shown.map((n) => <NavButton key={n.id} item={n} on={n.id === section} onPick={setSection} />)
              : NAV.map((n, i) => (n === 'sep' ? <hr key={`sep-${i}`} /> : <NavButton key={n.id} item={n} on={n.id === section} onPick={setSection} />))}
          </nav>
          <div className="st-pane" ref={pane}>
            {body}
          </div>
        </div>
      </div>
    </div>
  );
}

function NavButton({ item, on, onPick }: { item: NavItem; on: boolean; onPick(s: SettingsSection): void }) {
  return (
    <button type="button" className={`st-nav-item${on ? ' is-on' : ''}`} aria-current={on ? 'page' : undefined} onClick={() => onPick(item.id)}>
      <Icon name={item.icon} />
      {item.label}
    </button>
  );
}
