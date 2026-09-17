import React, { useEffect, useMemo, useRef, useState } from "react";

const VIEWS = [["command", "Command center", "System overview and mission control"], ["workspace", "Workspace", "Boards, sprints, tasks, calendar, and notes"], ["github", "GitHub", "Repositories, issues, pull requests, and commits"], ["utilization", "Utilization", "Team capacity and individual dashboards"], ["files", "Files", "Private S3 storage"], ["vault", "Vault", "Passwords and secure credentials"], ["settings", "Settings", "Profile, integrations, people, and security"]];

export default function CommandPalette({ open, onClose, boards, onView, onBoard, onAssistant }) {
  const [query, setQuery] = useState(""); const [active, setActive] = useState(0); const inputRef = useRef(null);
  useEffect(() => { if (open) { setQuery(""); setActive(0); setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);
  const commands = useMemo(() => {
    const base = VIEWS.map(([id, label, detail]) => ({ id: "view-" + id, label, detail, group: "Navigate", run: () => onView(id) }));
    const boardCommands = boards.map((board) => ({ id: "board-" + board._id, label: board.name, detail: board.access === "shared" ? "Shared by @" + (board.owner?.username || "user") : "Open planning board", group: "Boards", run: () => onBoard(board._id) }));
    const actions = [{ id: "assistant", label: "Toggle assistant", detail: "Open or close contextual intelligence", group: "Command", run: onAssistant }];
    const needle = query.trim().toLowerCase();
    return [...actions, ...base, ...boardCommands].filter((item) => !needle || (item.label + " " + item.detail + " " + item.group).toLowerCase().includes(needle));
  }, [boards, onAssistant, onBoard, onView, query]);
  if (!open) return null;
  function execute(item) { item?.run(); onClose(); }
  return <div className="command-palette-backdrop" onMouseDown={onClose}><section className="command-palette" onMouseDown={(event) => event.stopPropagation()}><header><span className="command-glyph">⌘</span><input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setActive(0); }} onKeyDown={(event) => { if (event.key === "Escape") onClose(); if (event.key === "ArrowDown") { event.preventDefault(); setActive((value) => Math.min(commands.length - 1, value + 1)); } if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => Math.max(0, value - 1)); } if (event.key === "Enter") execute(commands[active]); }} placeholder="Search commands, boards, and systems..." /></header><div className="command-results">{commands.map((item, index) => <button type="button" key={item.id} className={index === active ? "active" : ""} onMouseEnter={() => setActive(index)} onClick={() => execute(item)}><span>{item.group}</span><div><strong>{item.label}</strong><small>{item.detail}</small></div><kbd>↵</kbd></button>)}{!commands.length && <div className="command-empty">No matching command</div>}</div><footer><span>↑↓ Navigate</span><span>Enter Select</span><span>Esc Close</span></footer></section></div>;
}
