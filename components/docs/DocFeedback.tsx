'use client';

import { useState } from 'react';
import { Icon } from '@/components/Icon';

/* "Was this page helpful?" The answer isn't stored yet; it only thanks the reader. */
export function DocFeedback() {
  const [said, setSaid] = useState<null | 'yes' | 'no'>(null);
  return (
    <div className="dk-help">
      <div>
        <b>{said ? 'Thanks for telling us.' : 'Was this page helpful?'}</b>
        <small>{said === 'no' ? 'We’ll work on making this page clearer.' : 'Your answer helps us improve the docs.'}</small>
      </div>
      {!said && (
        <div className="dk-help-btns">
          <button type="button" onClick={() => setSaid('yes')}>
            <Icon name="thumbup" className="ic" />
            Yes
          </button>
          <button type="button" onClick={() => setSaid('no')}>
            <Icon name="thumbdown" className="ic" />
            No
          </button>
        </div>
      )}
    </div>
  );
}
