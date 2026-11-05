/* Word (.docx) writer. Produces a real Office Open XML package with styles,
   hanging-indent references, clickable links and genuine Word footnotes. */
import type { Block, DocModel, DocOptions, Run } from './docmodel';
import { zip } from './zip';

const x = (s: string) =>
  String(s)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const W_NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

type Ctx = { links: string[]; allowLinks: boolean };

function runXml(r: Run, ctx: Ctx, extraRpr = ''): string {
  if (r.noteRef) {
    return `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${r.noteRef}"/></w:r>`;
  }
  const rpr = `${r.b ? '<w:b/>' : ''}${r.i ? '<w:i/>' : ''}${r.sup ? '<w:vertAlign w:val="superscript"/>' : ''}${extraRpr}`;
  if (r.href && ctx.allowLinks && /^https?:\/\//.test(r.href)) {
    ctx.links.push(r.href);
    const id = `rIdL${ctx.links.length}`;
    return `<w:hyperlink r:id="${id}" w:history="1"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/>${rpr}</w:rPr><w:t xml:space="preserve">${x(r.text)}</w:t></w:r></w:hyperlink>`;
  }
  return `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${x(r.text)}</w:t></w:r>`;
}

const para = (ppr: string, body: string) => `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${body}</w:p>`;

function blockXml(b: Block, ctx: Ctx): string {
  const runs = (rs: Run[], extra = '') => rs.map((r) => runXml(r, ctx, extra)).join('');
  switch (b.kind) {
    case 'para':
      return para('<w:pStyle w:val="BodyText"/>', runs(b.runs));
    case 'heading':
      return para('<w:pStyle w:val="ListTitle"/>', runs(b.runs));
    case 'ref':
      return para(
        `<w:pStyle w:val="Reference"/>${b.label ? '<w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs>' : ''}`,
        (b.label ? `<w:r><w:t xml:space="preserve">${x(b.label)}</w:t></w:r><w:r><w:tab/></w:r>` : '') + runs(b.runs),
      );
    case 'annot':
      return para('<w:pStyle w:val="Annotation"/>', runs(b.runs));
    case 'note':
      return para(
        '<w:pStyle w:val="NoteText"/><w:tabs><w:tab w:val="left" w:pos="360"/></w:tabs>',
        `<w:r><w:t xml:space="preserve">${b.n}.</w:t></w:r><w:r><w:tab/></w:r>` + runs(b.runs),
      );
    case 'rule':
      return para('<w:pBdr><w:top w:val="single" w:sz="4" w:space="1" w:color="999999"/></w:pBdr><w:spacing w:before="0" w:after="0"/><w:ind w:right="6000"/>', '');
  }
}

function stylesXml(o: DocOptions) {
  const sz = o.fontSize * 2;
  const line = Math.round(240 * o.spacing);
  const font = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W_NS}>
<w:docDefaults><w:rPrDefault><w:rPr>${font}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/><w:spacing w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="${sz + 12}"/><w:szCs w:val="${sz + 12}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Byline"><w:name w:val="Byline"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="480"/></w:pPr><w:rPr><w:color w:val="444444"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="BodyText"><w:name w:val="Body Text"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="0" w:line="${line}" w:lineRule="auto"/><w:ind w:firstLine="720"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="ListTitle"><w:name w:val="Reference List Title"/><w:basedOn w:val="Normal"/><w:next w:val="Reference"/><w:qFormat/><w:pPr><w:keepNext/><w:pageBreakBefore/><w:jc w:val="center"/><w:spacing w:before="0" w:after="240"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Reference"><w:name w:val="Reference Entry"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="0" w:line="${line}" w:lineRule="auto"/><w:ind w:left="720" w:hanging="720"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Annotation"><w:name w:val="Annotation"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="${Math.round(200 * o.spacing)}" w:line="${line}" w:lineRule="auto"/><w:ind w:left="720"/></w:pPr><w:rPr><w:color w:val="333333"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="NoteText"><w:name w:val="Note Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/><w:ind w:left="360" w:hanging="360"/></w:pPr><w:rPr><w:sz w:val="${sz - 4}"/><w:szCs w:val="${sz - 4}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="40"/></w:pPr><w:rPr><w:sz w:val="${sz - 4}"/><w:szCs w:val="${sz - 4}"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="1F4E79"/><w:u w:val="single"/></w:rPr></w:style>
</w:styles>`;
}

export function buildDocx(model: DocModel, o: DocOptions): Uint8Array {
  const ctx: Ctx = { links: [], allowLinks: true };
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  let body = '';
  if (o.titleBlock && o.title) {
    body += para('<w:pStyle w:val="Title"/>', `<w:r><w:t xml:space="preserve">${x(o.title)}</w:t></w:r>`);
    body += para('<w:pStyle w:val="Byline"/>', `<w:r><w:t xml:space="preserve">${x([o.author, today].filter(Boolean).join(', '))}</w:t></w:r>`);
  }
  body += model.blocks.map((b) => blockXml(b, ctx)).join('');

  const pg = o.paper === 'a4' ? 'w:w="11906" w:h="16838"' : 'w:w="12240" w:h="15840"';
  const hasFn = model.footnotes.size > 0;
  const sect = `<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/>${hasFn ? '<w:footnotePr><w:numFmt w:val="decimal"/></w:footnotePr>' : ''}<w:pgSz ${pg}/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${W_NS}><w:body>${body}${sect}</w:body></w:document>`;

  const fnCtx: Ctx = { links: [], allowLinks: false };
  const footnotes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:footnotes ${W_NS}>
<w:footnote w:type="separator" w:id="-1"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:separator/></w:r></w:p></w:footnote>
<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>
${[...model.footnotes.entries()]
  .map(
    ([n, runs]) =>
      `<w:footnote w:id="${n}"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> </w:t></w:r>${runs.map((r) => runXml(r, fnCtx)).join('')}</w:p></w:footnote>`,
  )
  .join('\n')}
</w:footnotes>`;

  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:ftr ${W_NS}><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:t>1</w:t></w:r><w:r><w:rPr><w:sz w:val="18"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;

  const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:settings ${W_NS}><w:defaultTabStop w:val="720"/>${hasFn ? '<w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr>' : ''}<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
${hasFn ? '<Relationship Id="rIdFootnotes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>' : ''}
${ctx.links.map((u, i) => `<Relationship Id="rIdL${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${x(u)}" TargetMode="External"/>`).join('\n')}
</Relationships>`;

  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
${hasFn ? '<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>' : ''}
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${x(o.title || 'Manuscript')}</dc:title><dc:creator>${x(o.author || 'Citezeno')}</dc:creator>
<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Citezeno</Application></Properties>`;

  const files = [
    { name: '[Content_Types].xml', data: types },
    { name: '_rels/.rels', data: rootRels },
    { name: 'docProps/core.xml', data: core },
    { name: 'docProps/app.xml', data: app },
    { name: 'word/document.xml', data: document },
    { name: 'word/styles.xml', data: stylesXml(o) },
    { name: 'word/settings.xml', data: settings },
    { name: 'word/footer1.xml', data: footer },
    { name: 'word/_rels/document.xml.rels', data: rels },
  ];
  if (hasFn) files.push({ name: 'word/footnotes.xml', data: footnotes });
  return zip(files);
}
