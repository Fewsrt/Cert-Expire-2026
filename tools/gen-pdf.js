#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const inPath = process.argv[2] || path.join(__dirname, '..', 'docs', '99-executive-summary.md');
const outPath = process.argv[3] || path.join(__dirname, '..', 'dist', 'secureboot-executive-summary.pdf');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function parseMarkdownToRuns(md) {
  // Minimal parser: headings, bullets, code fences -> monospaced block.
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const runs = [];
  let inCode = false;
  let codeBuf = [];

  for (const line of lines) {
    const fence = line.trim().startsWith('```');
    if (fence) {
      if (!inCode) {
        inCode = true;
        codeBuf = [];
      } else {
        inCode = false;
        runs.push({ type: 'code', text: codeBuf.join('\n') });
        codeBuf = [];
      }
      continue;
    }

    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    if (/^#\s+/.test(line)) {
      runs.push({ type: 'h1', text: line.replace(/^#\s+/, '').trim() });
    } else if (/^##\s+/.test(line)) {
      runs.push({ type: 'h2', text: line.replace(/^##\s+/, '').trim() });
    } else if (/^###\s+/.test(line)) {
      runs.push({ type: 'h3', text: line.replace(/^###\s+/, '').trim() });
    } else if (/^\s*[-*]\s+/.test(line)) {
      runs.push({ type: 'bullet', text: line.replace(/^\s*[-*]\s+/, '').trim() });
    } else if (line.trim() === '') {
      runs.push({ type: 'spacer' });
    } else {
      runs.push({ type: 'p', text: line });
    }
  }

  if (inCode && codeBuf.length) {
    runs.push({ type: 'code', text: codeBuf.join('\n') });
  }

  return runs;
}

function render(inFile, outFile) {
  const md = fs.readFileSync(inFile, 'utf8');
  const runs = parseMarkdownToRuns(md);

  ensureDir(path.dirname(outFile));

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 54, bottom: 54, left: 54, right: 54 },
    info: {
      Title: 'Secure Boot Executive Summary',
      Author: 'javis',
    },
  });

  doc.pipe(fs.createWriteStream(outFile));

  const styles = {
    h1: { font: 'Helvetica-Bold', size: 18, gap: 10 },
    h2: { font: 'Helvetica-Bold', size: 14, gap: 8 },
    h3: { font: 'Helvetica-Bold', size: 12, gap: 6 },
    p: { font: 'Helvetica', size: 10.5, gap: 4 },
    bullet: { font: 'Helvetica', size: 10.5, gap: 2 },
    code: { font: 'Courier', size: 9.5, gap: 6 },
  };

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  function addSpacer(h = 6) {
    doc.moveDown(h / 12);
  }

  for (const run of runs) {
    if (run.type === 'spacer') {
      addSpacer(6);
      continue;
    }

    if (run.type === 'bullet') {
      const st = styles.bullet;
      doc.font(st.font).fontSize(st.size);
      const x = doc.x;
      const y = doc.y;
      doc.text('•', x, y, { continued: true });
      doc.text(' ' + run.text, { width: pageWidth - 12 });
      addSpacer(st.gap);
      continue;
    }

    if (run.type === 'code') {
      const st = styles.code;
      doc.font(st.font).fontSize(st.size);
      const pad = 6;
      const text = run.text || '';
      // Estimate height by rendering in a box.
      const startY = doc.y;
      const boxWidth = pageWidth;
      const boxOptions = { width: boxWidth - pad * 2 };
      const textHeight = doc.heightOfString(text, boxOptions);
      const boxHeight = textHeight + pad * 2;

      doc.save();
      doc.roundedRect(doc.x, startY, boxWidth, boxHeight, 4).fill('#f5f5f5');
      doc.fillColor('#000').font(st.font).fontSize(st.size);
      doc.text(text, doc.x + pad, startY + pad, boxOptions);
      doc.restore();

      doc.y = startY + boxHeight;
      addSpacer(st.gap);
      continue;
    }

    const st = styles[run.type] || styles.p;
    doc.font(st.font).fontSize(st.size).fillColor('#000');

    if (run.type === 'h1') {
      doc.text(run.text, { width: pageWidth });
      addSpacer(st.gap);
      doc.moveTo(doc.x, doc.y).lineTo(doc.x + pageWidth, doc.y).strokeColor('#ddd').stroke();
      addSpacer(8);
      continue;
    }

    doc.text(run.text, { width: pageWidth });
    addSpacer(st.gap);
  }

  doc.end();
}

render(inPath, outPath);
console.error(`Wrote: ${outPath}`);
