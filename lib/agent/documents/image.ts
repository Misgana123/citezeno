import { z } from 'zod';

/* Editing a picture with sharp: resize, crop, rotate, flip, grayscale, then
   save as PNG, JPEG or WebP. Inputs are pictures the user attached or the
   assistant made; very large pictures are refused before they are decoded. */

export const IMAGE_FORMATS = ['png', 'jpeg', 'webp'] as const;
export type ImageFormat = (typeof IMAGE_FORMATS)[number];
export const IMAGE_MIME: Record<ImageFormat, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };

/* Largest picture read (pixels) and largest side made. */
const INPUT_PIXELS_MAX = 40_000_000;
const SIDE_MAX = 6000;
const side = z.number().int().min(1).max(SIDE_MAX);

export const imageOperation = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('resize'),
    width: side.optional(),
    height: side.optional(),
    fit: z.enum(['inside', 'cover', 'contain', 'fill']).optional().describe('inside (default): fit within, keep the shape'),
  }),
  z.object({ op: z.literal('crop'), left: z.number().int().min(0), top: z.number().int().min(0), width: side, height: side }),
  z.object({ op: z.literal('rotate'), degrees: z.number().min(-360).max(360) }),
  z.object({ op: z.literal('flip_vertical') }),
  z.object({ op: z.literal('flip_horizontal') }),
  z.object({ op: z.literal('grayscale') }),
]);
export type ImageOperation = z.infer<typeof imageOperation>;

export class ImageEditError extends Error {}

/* Apply the operations in order and encode the result. */
export async function editImage(bytes: Uint8Array, ops: ImageOperation[], out: { format: ImageFormat; quality?: number }): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const sharp = (await import('sharp')).default;
  const open = (b: Uint8Array | Buffer) => sharp(b, { limitInputPixels: INPUT_PIXELS_MAX, failOn: 'error' });
  let current: Buffer = Buffer.from(bytes);
  try {
    const meta = await open(current).metadata();
    if (!meta.width || !meta.height) throw new ImageEditError('That file isn’t a picture that can be edited.');
    // each step on its own, so crops and resizes apply to the picture as it is by then
    current = await open(current).rotate().toBuffer(); // upright, from the camera's orientation
    for (const op of ops) {
      const img = open(current);
      if (op.op === 'resize') {
        if (!op.width && !op.height) throw new ImageEditError('A resize needs a width or a height.');
        img.resize({ width: op.width, height: op.height, fit: op.fit ?? 'inside', withoutEnlargement: false, background: { r: 255, g: 255, b: 255, alpha: 0 } });
      } else if (op.op === 'crop') {
        const m = await open(current).metadata();
        if (op.left + op.width > m.width! || op.top + op.height > m.height!) throw new ImageEditError(`The crop goes past the picture (${m.width}×${m.height} pixels).`);
        img.extract({ left: op.left, top: op.top, width: op.width, height: op.height });
      } else if (op.op === 'rotate') img.rotate(op.degrees, { background: { r: 255, g: 255, b: 255, alpha: 0 } });
      else if (op.op === 'flip_vertical') img.flip();
      else if (op.op === 'flip_horizontal') img.flop();
      else img.grayscale();
      current = await img.toBuffer();
    }
    const final = open(current);
    const q = out.quality ?? 85;
    const encoded = await (
      out.format === 'png' ? final.png({ compressionLevel: 9 }) : out.format === 'jpeg' ? final.flatten({ background: '#ffffff' }).jpeg({ quality: q, mozjpeg: true }) : final.webp({ quality: q })
    ).toBuffer({ resolveWithObject: true });
    if (encoded.info.width > SIDE_MAX || encoded.info.height > SIDE_MAX) throw new ImageEditError(`The result would be over ${SIDE_MAX} pixels on a side.`);
    return { bytes: new Uint8Array(encoded.data), width: encoded.info.width, height: encoded.info.height };
  } catch (e) {
    if (e instanceof ImageEditError) throw e;
    const msg = (e as Error)?.message ?? '';
    if (/pixel limit/i.test(msg)) throw new ImageEditError('That picture is too large to edit.');
    if (/unsupported image format|Input buffer|corrupt|bad seek/i.test(msg)) throw new ImageEditError('That file isn’t a picture that can be edited.');
    throw e;
  }
}
