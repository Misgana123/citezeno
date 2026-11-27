/* Roboto, as pdfmake ships it (a JavaScript file of the font files), so the
   PDF and chart builders draw text the same way everywhere, including servers
   with no fonts installed. Loaded once, when first needed. */

let fonts: Promise<Record<string, Buffer>> | null = null;

/* "Roboto-Regular.ttf" → its bytes (also -Medium, -Italic, -MediumItalic). */
export function robotoFonts(): Promise<Record<string, Buffer>> {
  return (fonts ??= (async () => {
    const mod = (await import('pdfmake/build/vfs_fonts')) as unknown as { default?: Record<string, string> } & Record<string, string>;
    const vfs = mod.default ?? mod;
    return Object.fromEntries(Object.entries(vfs).flatMap(([name, b64]) => (name.endsWith('.ttf') ? [[name, Buffer.from(b64, 'base64')]] : [])));
  })());
}

let files: Promise<string[]> | null = null;

/* The same fonts as files in the temporary folder, for libraries that only read
   fonts from disk (the chart painter). Written once per server instance. */
export function robotoFontFiles(): Promise<string[]> {
  return (files ??= (async () => {
    const [{ mkdir, writeFile }, { tmpdir }, { join }] = await Promise.all([import('node:fs/promises'), import('node:os'), import('node:path')]);
    const dir = join(tmpdir(), 'citezeno-fonts');
    await mkdir(dir, { recursive: true });
    return Promise.all(
      Object.entries(await robotoFonts()).map(async ([name, bytes]) => {
        const path = join(dir, name);
        await writeFile(path, bytes);
        return path;
      }),
    );
  })().catch((e) => {
    files = null;
    throw e;
  }));
}
