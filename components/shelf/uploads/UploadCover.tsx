/* A PDF's first page, drawn: its title in the reading serif over text lines,
   with how far it has been read along the bottom. Drawn rather than rendered
   so the gallery never downloads every PDF. */
const LINES = Array.from({ length: 10 }, (_, i) => 62 + ((i * 37) % 34));

export function UploadCover({ title, progress }: { title: string; progress: number | null }) {
  return (
    <span className="sh-cover" aria-hidden="true">
      <b>{title}</b>
      <span className="sh-cover-lines">
        {LINES.map((w, i) => (
          <i key={i} style={{ width: `${w}%` }} />
        ))}
      </span>
      {progress != null && (
        <span className="sh-cover-prog">
          <i style={{ width: `${Math.max(3, Math.round(progress * 100))}%` }} />
        </span>
      )}
    </span>
  );
}
