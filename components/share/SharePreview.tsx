'use client';

import { useEffect, useRef, useState } from 'react';
import type { ShareTheme } from '@/lib/share-themes';
import type { ShareView } from '@/lib/share-view';
import { Icon } from '../Icon';
import { SharedTrace } from './SharedTrace';

/* The public page is laid out at desktop width and scaled to fit the pane. */
const FRAME_W = 1280;

/* Live preview of the public page, rendered with the exact components the
   server uses. Links and buttons are inert; the style switch inside still works. */
export function SharePreview({ theme, view, style, onStyle, token }: { theme: ShareTheme; view: ShareView; style: string; onStyle: (id: string) => void; token?: string }) {
  const pane = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [height, setHeight] = useState(1200);
  const [host, setHost] = useState('citezeno.com');

  useEffect(() => {
    setHost(window.location.host.replace(/^www\./, ''));
    const p = pane.current;
    const f = frame.current;
    if (!p || !f) return;
    const fit = () => {
      setScale(Math.min(1, p.clientWidth / FRAME_W));
      setHeight(f.offsetHeight);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(p);
    ro.observe(f);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="shp">
      <div className="shp-chrome">
        <span className="shp-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="shp-url">
          <Icon name="lock" /> {host}/s/{token || '········'}
        </span>
        <span className="shp-tag">Preview</span>
      </div>
      <div
        className="shp-scroll"
        ref={pane}
        onClickCapture={(e) => {
          const t = e.target as HTMLElement;
          if (t.closest('a, button')) e.preventDefault();
        }}
      >
        <div className="shp-stage" style={{ height: Math.ceil(height * scale) }}>
          <div className="shp-frame" ref={frame} style={{ width: FRAME_W, transform: `scale(${scale})` }}>
            <SharedTrace theme={theme} view={view} tools={{ style, bib: view.bib, preview: true, onStyle }} />
          </div>
        </div>
      </div>
    </div>
  );
}
