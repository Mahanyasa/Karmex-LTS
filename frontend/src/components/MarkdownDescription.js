import React from "react";

// A deliberately small Markdown subset. React escapes all text; raw HTML is never interpreted.
function inline(text) {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^\s)]+\))/g).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    const link = part.match(/^\[([^\]]+)\]\(([^\s)]+)\)$/);
    if (link && /^https?:\/\//i.test(link[2])) return <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    return part;
  });
}
export default function MarkdownDescription({ text = "" }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n"), output = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("```")) {
      const code = []; const key = i;
      while (++i < lines.length && !lines[i].startsWith("```")) code.push(lines[i]);
      output.push(<pre key={key}><code>{code.join("\n")}</code></pre>); continue;
    }
    const heading = lines[i].match(/^(#{1,3})\s+(.+)$/);
    if (heading) { const Tag = `h${heading[1].length + 2}`; output.push(<Tag key={i}>{inline(heading[2])}</Tag>); }
    else if (/^[-*] /.test(lines[i])) {
      const list = [], key = i;
      while (i < lines.length && /^[-*] /.test(lines[i])) { list.push(<li key={i}>{inline(lines[i].slice(2))}</li>); i++; }
      i--; output.push(<ul key={key}>{list}</ul>);
    } else if (lines[i]) output.push(<p key={i}>{inline(lines[i])}</p>);
  }
  return <div className="issue-markdown">{output.length ? output : <p>No description yet.</p>}</div>;
}
