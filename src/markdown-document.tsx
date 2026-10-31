import React from "react";
import { marked, type Token, type Tokens } from "marked";

// Render tokens as React nodes. Never execute raw HTML or load remote images from specifications.
function nodes(tokens: Token[]): React.ReactNode {
  return tokens.map((token, index) => {
    const t = token as Token & { tokens?: Token[]; text?: string };
    const children = t.tokens ? nodes(t.tokens) : t.text;
    switch (token.type) {
      case "space": return null;
      case "heading": return React.createElement(`h${(token as Tokens.Heading).depth}`, { key: index }, children);
      case "paragraph": return <p key={index}>{children}</p>;
      case "text": case "escape": return <React.Fragment key={index}>{children}</React.Fragment>;
      case "strong": return <strong key={index}>{children}</strong>;
      case "em": return <em key={index}>{children}</em>;
      case "del": return <del key={index}>{children}</del>;
      case "codespan": return <code key={index}>{t.text}</code>;
      case "code": return <pre key={index}><code>{t.text}</code></pre>;
      case "br": return <br key={index} />;
      case "hr": return <hr key={index} />;
      case "blockquote": return <blockquote key={index}>{children}</blockquote>;
      case "list": {
        const list = token as Tokens.List;
        const items = list.items.map((item, i) => <li key={i}>{item.task && <input type="checkbox" checked={!!item.checked} disabled aria-label={item.checked ? "Completed task" : "Incomplete task"} />}{nodes(item.tokens)}</li>);
        return list.ordered ? <ol key={index} start={Number(list.start) || 1}>{items}</ol> : <ul key={index}>{items}</ul>;
      }
      case "table": {
        const table = token as Tokens.Table;
        return <div className="markdown-table" key={index}><table><thead><tr>{table.header.map((cell, i) => <th key={i}>{nodes(cell.tokens)}</th>)}</tr></thead><tbody>{table.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{nodes(cell.tokens)}</td>)}</tr>)}</tbody></table></div>;
      }
      case "link": {
        const href = (token as Tokens.Link).href;
        return /^https?:\/\//i.test(href) ? <a key={index} href={href} target="_blank" rel="noreferrer noopener">{children}</a> : <span key={index}>{children} <code>{href}</code></span>;
      }
      case "image": return <span key={index}>[Image: {t.text}]</span>;
      default: return <span className="markdown-literal" key={index}>{token.raw}</span>;
    }
  });
}
export function MarkdownDocument({ content }: { content: string }) {
  return <div className="markdown-document">{nodes(marked.lexer(content))}</div>;
}
