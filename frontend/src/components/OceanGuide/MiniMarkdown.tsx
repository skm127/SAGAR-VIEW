/**
 * MiniMarkdown — renders the small markdown subset the SAGAR AI replies use
 * (blank-line paragraphs, **bold**, *italic*, `code`, "- " bullets) as React
 * elements. No dangerouslySetInnerHTML: model output is never injected as HTML,
 * so this is XSS-safe by construction.
 */
import type { ReactNode } from 'react';

/** Render inline formatting (**bold**, *italic*, `code`) within a text run. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Split on **bold**, `code`, *italic* (in that priority order)
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g;
  const parts = text.split(pattern);
  parts.forEach((part, i) => {
    if (!part) return;
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      nodes.push(<strong key={key}>{part.slice(2, -2)}</strong>);
    } else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      nodes.push(<code key={key}>{part.slice(1, -1)}</code>);
    } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      nodes.push(<em key={key}>{part.slice(1, -1)}</em>);
    } else {
      nodes.push(<span key={key}>{part}</span>);
    }
  });
  return nodes;
}

export function MiniMarkdown({ text }: { text: string }) {
  const blocks = (text ?? '').split(/\n{2,}/).filter((b) => b.trim().length > 0);

  return (
    <>
      {blocks.map((block, bi) => {
        const lines = block.split('\n');
        const isBullets = lines.every((l) => /^\s*[-•]\s+/.test(l));
        if (isBullets) {
          return (
            <ul key={`ul-${bi}`}>
              {lines.map((line, li) => (
                <li key={`li-${li}`}>{renderInline(line.replace(/^\s*[-•]\s+/, ''), `b${bi}-${li}`)}</li>
              ))}
            </ul>
          );
        }
        return <p key={`p-${bi}`}>{renderInline(block, `b${bi}`)}</p>;
      })}
    </>
  );
}

export default MiniMarkdown;
