'use client';

import type { FilePicker } from '@/lib/providers/connectors/types';

/* Google Picker: Google's own file chooser, shown over our page. Choosing a
   file is what gives Citezeno access to it (drive.file). Its script is loaded
   only when the user opens it. */

export type PickedFile = { id: string; name: string; mime: string; size: number | null };

type PickerDoc = { id: string; name: string; mimeType: string; sizeBytes?: number | string };
type PickerData = { action: string; docs?: PickerDoc[] };
type Builder = {
  addView(v: unknown): Builder;
  setOAuthToken(t: string): Builder;
  setDeveloperKey(k: string): Builder;
  setAppId(id: string): Builder;
  setOrigin(o: string): Builder;
  setTitle(t: string): Builder;
  enableFeature(f: unknown): Builder;
  setCallback(cb: (d: PickerData) => void): Builder;
  build(): { setVisible(v: boolean): void };
};
type PickerNs = {
  DocsView: new (viewId?: unknown) => { setMimeTypes(m: string): unknown; setIncludeFolders(b: boolean): unknown; setSelectFolderEnabled(b: boolean): unknown; setMode(m: unknown): unknown };
  ViewId: { DOCS: unknown };
  DocsViewMode: { LIST: unknown };
  PickerBuilder: new () => Builder;
  Feature: { MULTISELECT_ENABLED: unknown; NAV_HIDDEN: unknown };
  Action: { PICKED: string; CANCEL: string };
};
type Win = Window & { gapi?: { load(name: string, cb: () => void): void }; google?: { picker?: PickerNs } };

let loading: Promise<PickerNs> | null = null;

function loadPicker(scriptUrl: string): Promise<PickerNs> {
  const w = window as Win;
  if (w.google?.picker) return Promise.resolve(w.google.picker);
  loading ??= new Promise<PickerNs>((resolve, reject) => {
    const ready = () => w.gapi!.load('picker', () => (w.google?.picker ? resolve(w.google.picker) : reject(new Error('The Google file picker didn’t load.'))));
    if (w.gapi) return ready();
    const s = document.createElement('script');
    s.src = scriptUrl;
    s.async = true;
    s.onload = ready;
    s.onerror = () => {
      loading = null;
      reject(new Error('The Google file picker couldn’t be loaded. Check your connection, or turn off a blocker for this site.'));
    };
    document.head.append(s);
  });
  return loading;
}

export async function googlePick(cfg: FilePicker, opts: { mimeTypes?: string[]; multiple?: boolean; title?: string }): Promise<PickedFile[]> {
  const picker = await loadPicker(cfg.scriptUrl);
  return new Promise((resolve) => {
    const view = new picker.DocsView(picker.ViewId.DOCS);
    if (opts.mimeTypes?.length) view.setMimeTypes(opts.mimeTypes.join(','));
    view.setIncludeFolders(true);
    view.setSelectFolderEnabled(false);
    view.setMode(picker.DocsViewMode.LIST);
    let b = new picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(cfg.accessToken)
      .setDeveloperKey(cfg.apiKey)
      .setAppId(cfg.appId)
      .setOrigin(window.location.origin)
      .setCallback((d) => {
        if (d.action === picker.Action.PICKED) {
          resolve(
            (d.docs ?? []).map((doc) => {
              const size = Number(doc.sizeBytes);
              return { id: doc.id, name: doc.name, mime: doc.mimeType, size: Number.isFinite(size) && size > 0 ? size : null };
            }),
          );
        } else if (d.action === picker.Action.CANCEL) resolve([]);
      });
    if (opts.title) b = b.setTitle(opts.title);
    if (opts.multiple) b = b.enableFeature(picker.Feature.MULTISELECT_ENABLED);
    b.build().setVisible(true);
  });
}
