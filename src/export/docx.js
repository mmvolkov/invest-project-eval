/** Отчёт в Word (docx.js) */
import { fmt, downloadBlob, safeName } from '../ui/format.js';

export function hasDocx() {
  return typeof window !== 'undefined' && typeof window.docx !== 'undefined';
}

function b64ToBytes(dataUrl) {
  const b64 = dataUrl.split(',')[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function exportDocx({ template, inputs, levelId, result, charts = [], aiConclusion = '', analysisText = [] }) {
  if (!hasDocx()) throw new Error('Библиотека docx не загружена');
  const D = window.docx;
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, HeadingLevel, WidthType, AlignmentType, PageOrientation, BorderStyle } = D;
  const name = inputs?.general?.name || inputs?.name || template.title;
  const unit = result.unit || inputs?.general?.unit || '';
  const children = [];
  const P = (text, opts = {}) => new Paragraph({ children: [new TextRun({ text, ...opts })], spacing: { after: 80 } });
  const H = (text, level = HeadingLevel.HEADING_1) => new Paragraph({ text, heading: level, spacing: { before: 200, after: 100 } });

  children.push(new Paragraph({ text: `Отчёт: ${name}`, heading: HeadingLevel.TITLE }));
  children.push(P(`${template.title}. Уровень модели: ${levelId}. Дата: ${new Date().toLocaleDateString('ru-RU')}.`, { color: '555555' }));
  children.push(P(template.description, { italics: true, size: 18 }));

  children.push(H('1. Ключевые показатели'));
  children.push(kpiTable(D, result.kpis, unit));

  children.push(H('2. Заключение'));
  for (const line of result.conclusion) children.push(new Paragraph({ text: line, bullet: { level: 0 }, spacing: { after: 60 } }));
  if (analysisText.length) {
    children.push(H('2.1. Анализ рисков и чувствительности', HeadingLevel.HEADING_2));
    for (const line of analysisText) children.push(new Paragraph({ text: line, bullet: { level: 0 }, spacing: { after: 60 } }));
  }
  if (aiConclusion) {
    children.push(H('2.2. Заключение ИИ-ассистента', HeadingLevel.HEADING_2));
    for (const line of String(aiConclusion).split('\n')) if (line.trim()) children.push(P(line.replace(/^[#*\-\s]+/, '')));
  }

  if (charts.length) {
    children.push(H('3. Графики'));
    for (const c of charts) {
      try {
        const bytes = b64ToBytes(c.dataUrl);
        const w = 600;
        const h = Math.round((c.height / c.width) * w) || 300;
        children.push(P(c.title, { bold: true }));
        children.push(new Paragraph({ children: [new ImageRun({ type: 'png', data: bytes, transformation: { width: w, height: h } })], spacing: { after: 160 } }));
      } catch (e) {
        children.push(P(`[график ${c.title} не удалось вставить]`, { color: '999999' }));
      }
    }
  }

  children.push(H('4. Расчётные таблицы'));
  for (const t of result.tables) {
    children.push(new Paragraph({ text: `${t.title}${t.unit ? `, ${t.unit}` : ''}`, heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 80 } }));
    children.push(dataTable(D, t));
  }

  children.push(H('5. Исходные данные'));
  children.push(P(JSON.stringify(inputs, null, 1).replace(/[{}"]/g, '').replace(/\n\s*\n/g, '\n'), { size: 14, font: 'Consolas' }));
  children.push(P('Сформировано сервисом «Оценка инвестпроектов». Методика: NPV / IRR / PI / DPP, анализ чувствительности и сценариев.', { size: 16, color: '888888' }));

  const wide = result.tables.some((t) => t.columns.length > 8);
  const doc = new Document({
    creator: 'invest-project-eval',
    title: `Отчёт: ${name}`,
    styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
    sections: [{ properties: wide ? { page: { size: { orientation: PageOrientation.LANDSCAPE } } } : {}, children }],
  });
  const blob = await Packer.toBlob(doc);
  const fn = `${safeName(name)} — отчёт.docx`;
  downloadBlob(blob, fn);
  return fn;
}

function cell(D, text, { bold = false, align = 'left', shade = null, width = null, size = 16 } = {}) {
  const { TableCell, Paragraph, TextRun, AlignmentType, WidthType } = D;
  return new TableCell({
    children: [new Paragraph({ alignment: align === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: String(text ?? ''), bold, size })] })],
    shading: shade ? { fill: shade } : undefined,
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
  });
}

function kpiTable(D, kpis, unit) {
  const { Table, TableRow, WidthType } = D;
  const rows = [new TableRow({ tableHeader: true, children: [cell(D, 'Показатель', { bold: true, shade: 'E8F0FE' }), cell(D, 'Значение', { bold: true, shade: 'E8F0FE', align: 'right' }), cell(D, 'Оценка', { bold: true, shade: 'E8F0FE' }), cell(D, 'Комментарий', { bold: true, shade: 'E8F0FE' })] })];
  for (const k of kpis) {
    const v = fmt(k.value, k.fmt) + (k.fmt === 'money' && unit && k.value != null ? ` ${unit}` : '');
    rows.push(new TableRow({ children: [cell(D, k.label), cell(D, v, { align: 'right', bold: true }), cell(D, k.good === true ? '✓' : k.good === false ? '!' : '', { shade: k.good === true ? 'E4F5EA' : k.good === false ? 'FBE9E7' : null }), cell(D, k.hint || '', { size: 14 })] }));
  }
  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

function dataTable(D, t) {
  const { Table, TableRow, WidthType } = D;
  const size = t.columns.length > 10 ? 12 : t.columns.length > 6 ? 14 : 16;
  const rows = [new TableRow({ tableHeader: true, children: t.columns.map((c, i) => cell(D, c.label, { bold: true, shade: 'EEF2F8', align: i ? 'right' : 'left', size })) })];
  for (const r of t.rows) {
    const shade = r.style === 'total' ? 'EEF2F8' : r.style === 'warn' ? 'FFF4DC' : null;
    rows.push(new TableRow({ children: r.cells.map((c, i) => cell(D, fmt(c, i === 0 ? 'text' : r.fmt || t.columns[i]?.fmt || 'money'), { bold: r.style === 'total' || r.style === 'subtotal', align: i ? 'right' : 'left', shade, size })) }));
  }
  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}
