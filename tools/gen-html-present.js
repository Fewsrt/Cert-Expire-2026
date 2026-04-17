#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'present.html');
const EXCLUDED_FILES = new Set(['docs/11-sandbox-simulation-use-cases.md']);

function walkMarkdownFiles(dir, acc = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkMarkdownFiles(full, acc);
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      acc.push(full);
    }
  }
  return acc;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseInline(text) {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return s;
}

function markdownToHtml(md) {
  const lines = md
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => {
      for (const excluded of EXCLUDED_FILES) {
        if (line.includes(excluded) || line.includes(path.basename(excluded))) {
          return false;
        }
      }
      return true;
    });
  const out = [];
  let inCode = false;
  let codeLang = '';
  let inUl = false;
  let inOl = false;
  let inBlockquote = false;

  function closeLists() {
    if (inUl) {
      out.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      out.push('</ol>');
      inOl = false;
    }
  }

  function closeBlockquote() {
    if (inBlockquote) {
      out.push('</blockquote>');
      inBlockquote = false;
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      closeLists();
      closeBlockquote();
      if (!inCode) {
        inCode = true;
        codeLang = trimmed.replace(/^```/, '').trim();
        const cls = codeLang ? ` class="language-${escapeHtml(codeLang)}"` : '';
        out.push(`<pre><code${cls}>`);
      } else {
        inCode = false;
        codeLang = '';
        out.push('</code></pre>');
      }
      continue;
    }

    if (inCode) {
      out.push(`${escapeHtml(line)}\n`);
      continue;
    }

    if (trimmed === '') {
      closeLists();
      closeBlockquote();
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      closeLists();
      closeBlockquote();
      const level = heading[1].length;
      out.push(`<h${level}>${parseInline(heading[2])}</h${level}>`);
      continue;
    }

    const bq = line.match(/^\s*>\s?(.*)$/);
    if (bq) {
      closeLists();
      if (!inBlockquote) {
        out.push('<blockquote>');
        inBlockquote = true;
      }
      out.push(`<p>${parseInline(bq[1])}</p>`);
      continue;
    } else {
      closeBlockquote();
    }

    const ul = line.match(/^\s*[-*]\s+(.+)$/);
    if (ul) {
      if (!inUl) {
        closeLists();
        out.push('<ul>');
        inUl = true;
      }
      out.push(`<li>${parseInline(ul[1])}</li>`);
      continue;
    }

    const ol = line.match(/^\s*\d+\.\s+(.+)$/);
    if (ol) {
      if (!inOl) {
        closeLists();
        out.push('<ol>');
        inOl = true;
      }
      out.push(`<li>${parseInline(ol[1])}</li>`);
      continue;
    }

    closeLists();
    out.push(`<p>${parseInline(trimmed)}</p>`);
  }

  closeLists();
  closeBlockquote();
  if (inCode) {
    out.push('</code></pre>');
  }
  return out.join('\n');
}

function titleFromMarkdown(md, fallback) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const h1 = lines.find((line) => /^#\s+/.test(line));
  return h1 ? h1.replace(/^#\s+/, '').trim() : fallback;
}

function buildHtml(pages) {
  const navItems = pages
    .map(
      (page, i) =>
        `<button class="nav-item${i === 0 ? ' active' : ''}" data-index="${i}">${escapeHtml(page.path)}<small>${escapeHtml(page.title)}</small></button>`
    )
    .join('\n');

  const sections = pages
    .map(
      (page, i) => `
      <section class="slide${i === 0 ? ' active' : ''}" data-index="${i}">
        <div class="slide-meta">${escapeHtml(page.path)}</div>
        ${page.html}
      </section>`
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Docs HTML Presentation</title>
  <style>
    :root {
      --bg: #f4f6f8;
      --panel: #10212b;
      --panel-muted: #7f95a5;
      --text: #13242f;
      --accent: #0a7ea4;
      --line: #d8e1e8;
      --surface: #ffffff;
      --code-bg: #0f1720;
      --code-text: #e8f0f7;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "IBM Plex Sans Thai", "Noto Sans Thai", "Segoe UI", sans-serif;
      background: radial-gradient(circle at 10% 0%, #eaf2f9 0%, var(--bg) 45%, #e2ebf2 100%);
      color: var(--text);
    }
    .app {
      min-height: 100vh;
      display: grid;
      grid-template-columns: minmax(260px, 320px) 1fr;
    }
    aside {
      background: linear-gradient(180deg, #132733 0%, var(--panel) 100%);
      color: #fff;
      padding: 20px 14px;
      border-right: 1px solid #1f3a4b;
      position: sticky;
      top: 0;
      max-height: 100vh;
      overflow: auto;
    }
    .brand {
      font-weight: 700;
      letter-spacing: .2px;
      margin: 2px 8px 14px;
    }
    .hint {
      color: var(--panel-muted);
      font-size: 12px;
      margin: 0 8px 12px;
    }
    .nav-item {
      width: 100%;
      text-align: left;
      border: 1px solid #284153;
      background: #173140;
      color: #d7e5ef;
      border-radius: 8px;
      margin: 0 0 8px;
      padding: 8px 10px;
      cursor: pointer;
      font-size: 12px;
      line-height: 1.3;
      transition: 120ms ease;
    }
    .nav-item small {
      display: block;
      color: #8fb0c4;
      margin-top: 3px;
      font-size: 11px;
    }
    .nav-item.active,
    .nav-item:hover {
      border-color: #4e9fc0;
      background: #1f4255;
      color: #fff;
    }
    main {
      padding: 28px clamp(14px, 3vw, 48px);
    }
    .slide {
      display: none;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: clamp(16px, 2.2vw, 34px);
      box-shadow: 0 8px 22px rgba(16, 33, 43, 0.08);
      max-width: 980px;
      margin: 0 auto;
      animation: rise 180ms ease-out;
    }
    .slide.active { display: block; }
    .slide-meta {
      display: inline-block;
      margin-bottom: 12px;
      border: 1px solid #cfe0eb;
      background: #f1f8fc;
      color: #3f6172;
      border-radius: 999px;
      padding: 3px 10px;
      font-size: 12px;
    }
    h1, h2, h3, h4 { line-height: 1.2; margin: 14px 0 10px; }
    h1 { font-size: 32px; }
    h2 { font-size: 24px; }
    h3 { font-size: 19px; }
    p, li { line-height: 1.62; font-size: 16px; }
    code {
      background: #e8f1f7;
      padding: 2px 6px;
      border-radius: 6px;
      font-family: "IBM Plex Mono", "SFMono-Regular", Menlo, Consolas, monospace;
      font-size: .92em;
    }
    pre {
      overflow: auto;
      padding: 14px;
      border-radius: 10px;
      background: var(--code-bg);
      color: var(--code-text);
      border: 1px solid #1f2f3f;
    }
    pre code {
      background: transparent;
      padding: 0;
      color: inherit;
      border-radius: 0;
    }
    .mermaid-wrap {
      margin: 14px 0;
      padding: 12px;
      border: 1px solid #d6e4ee;
      border-radius: 10px;
      background: #f8fcff;
      overflow: auto;
    }
    .mermaid {
      min-width: 420px;
    }
    blockquote {
      margin: 12px 0;
      padding: 0 12px;
      border-left: 3px solid #8eb8ce;
      color: #365d70;
      background: #f2f8fb;
      border-radius: 6px;
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .foot {
      font-size: 12px;
      color: #5f7887;
      max-width: 980px;
      margin: 14px auto 0;
    }
    @keyframes rise {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @media (max-width: 860px) {
      .app { grid-template-columns: 1fr; }
      aside {
        position: static;
        max-height: none;
        border-right: none;
        border-bottom: 1px solid #1f3a4b;
      }
      .nav-item { font-size: 13px; }
    }
  </style>
</head>
<body>
  <div class="app">
    <aside>
      <div class="brand">HTML Presentation</div>
      <div class="hint">Use buttons or arrow keys (← →)</div>
      ${navItems}
    </aside>
    <main>
      ${sections}
      <div class="foot">Generated from Markdown files in this repository.</div>
    </main>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <script>
    const nav = Array.from(document.querySelectorAll('.nav-item'));
    const slides = Array.from(document.querySelectorAll('.slide'));
    let current = 0;

    function activate(index) {
      current = Math.max(0, Math.min(index, slides.length - 1));
      nav.forEach((el, i) => el.classList.toggle('active', i === current));
      slides.forEach((el, i) => el.classList.toggle('active', i === current));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    nav.forEach((btn) => {
      btn.addEventListener('click', () => activate(Number(btn.dataset.index)));
    });

    window.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight') activate(current + 1);
      if (event.key === 'ArrowLeft') activate(current - 1);
    });

    (async function renderMermaid() {
      if (!window.mermaid) return;

      const blocks = Array.from(document.querySelectorAll('pre > code.language-mermaid'));
      const targets = [];
      blocks.forEach((code, i) => {
        const pre = code.parentElement;
        const wrap = document.createElement('div');
        wrap.className = 'mermaid-wrap';

        const chart = document.createElement('div');
        chart.className = 'mermaid';
        chart.id = 'mermaid-' + i;
        chart.textContent = (code.textContent || '').trim();

        wrap.appendChild(chart);
        if (pre && pre.parentElement) {
          pre.parentElement.replaceChild(wrap, pre);
          targets.push(chart);
        }
      });

      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        theme: 'default',
      });

      for (const chart of targets) {
        try {
          const source = chart.textContent || '';
          await mermaid.parse(source, { suppressErrors: false });
          const { svg } = await mermaid.render(chart.id + '-svg', source);
          chart.innerHTML = svg;
        } catch (error) {
          const pre = document.createElement('pre');
          const code = document.createElement('code');
          code.className = 'language-mermaid';
          code.textContent = chart.textContent || '';
          pre.appendChild(code);

          chart.classList.remove('mermaid');
          chart.innerHTML = '';
          chart.appendChild(pre);
        }
      }
    })();
  </script>
</body>
</html>`;
}

function main() {
  const files = walkMarkdownFiles(ROOT)
    .map((file) => path.relative(ROOT, file))
    .filter((file) => !EXCLUDED_FILES.has(file))
    .sort((a, b) => a.localeCompare(b))
    .sort((a, b) => {
      if (a === 'README.md') return -1;
      if (b === 'README.md') return 1;
      return 0;
    });

  const pages = files.map((file) => {
    const full = path.join(ROOT, file);
    const md = fs.readFileSync(full, 'utf8');
    return {
      path: file,
      title: titleFromMarkdown(md, file),
      html: markdownToHtml(md),
    };
  });

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, buildHtml(pages), 'utf8');
  console.error(`Wrote: ${OUT} (${pages.length} documents)`);
}

main();
