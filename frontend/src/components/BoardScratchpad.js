import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../api";
import { useNotifications } from "../context/NotificationContext";

function useAutoSave({ boardId, path, payload, dirty, setDirty, setStatus, onSaved, notify }) {
  useEffect(() => {
    if (!boardId || !dirty) return undefined;
    setStatus("Saving...");
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.patch(`/boards/${boardId}/${path}`, payload);
        setDirty(false);
        setStatus("Saved");
        onSaved(data);
      } catch (err) {
        setStatus("Not saved");
        notify(err.response?.data?.message || `Failed to save ${path}`, "error");
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [boardId, dirty, notify, onSaved, path, payload, setDirty, setStatus]);
}

export default function BoardScratchpad({ board, onSaved }) {
  const { notify } = useNotifications();
  const notesRef = useRef(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [scratchBody, setScratchBody] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [scratchDirty, setScratchDirty] = useState(false);
  const [notesStatus, setNotesStatus] = useState("Ready");
  const [scratchStatus, setScratchStatus] = useState("Ready");

  useEffect(() => {
    setNoteTitle(board?.notes?.title || "");
    setNoteBody(board?.notes?.body || "");
    setScratchBody(board?.scratchpad?.body || "");
    setNotesDirty(false);
    setScratchDirty(false);
    setNotesStatus(board ? "Saved" : "Choose a board");
    setScratchStatus(board ? "Saved" : "Choose a board");
    // Load a document only when the user changes boards; autosave responses must not interrupt typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board?._id]);

  const notesPayload = useMemo(() => ({ title: noteTitle, body: noteBody }), [noteBody, noteTitle]);
  const scratchPayload = useMemo(() => ({ body: scratchBody }), [scratchBody]);
  useAutoSave({ boardId: board?._id, path: "notes", payload: notesPayload, dirty: notesDirty, setDirty: setNotesDirty, setStatus: setNotesStatus, onSaved, notify });
  useAutoSave({ boardId: board?._id, path: "scratchpad", payload: scratchPayload, dirty: scratchDirty, setDirty: setScratchDirty, setStatus: setScratchStatus, onSaved, notify });

  const wordCount = useMemo(() => noteBody.trim() ? noteBody.trim().split(/\s+/).length : 0, [noteBody]);

  const format = useCallback((before, after = before, placeholder = "text") => {
    const input = notesRef.current;
    if (!input) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const selected = noteBody.slice(start, end) || placeholder;
    setNoteBody(`${noteBody.slice(0, start)}${before}${selected}${after}${noteBody.slice(end)}`);
    setNotesDirty(true);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }, [noteBody]);

  return (
    <div className="writing-suite">
      <section className="notes-document">
        <div className="notes-toolbar" aria-label="Note formatting">
          <div className="toolbar-group">
            <button type="button" onClick={() => format("**")} title="Bold"><strong>B</strong></button>
            <button type="button" onClick={() => format("_", "_")} title="Italic"><em>I</em></button>
            <button type="button" onClick={() => format("# ", "", "Heading")} title="Heading">H1</button>
            <button type="button" onClick={() => format("- ", "", "List item")} title="Bulleted list">•</button>
            <button type="button" onClick={() => format("- [ ] ", "", "Task")} title="Checklist">☐</button>
            <button type="button" onClick={() => format("[", "](https://)", "link title")} title="Insert link">↗</button>
          </div>
          <div className="document-status"><span>{wordCount} words</span><span>{notesStatus}</span></div>
        </div>
        <div className="document-page">
          <input value={noteTitle} onChange={(event) => { setNoteTitle(event.target.value); setNotesDirty(true); }} placeholder="Untitled document" maxLength={120} disabled={!board} aria-label="Note title" />
          <textarea ref={notesRef} value={noteBody} onChange={(event) => { setNoteBody(event.target.value); setNotesDirty(true); }} placeholder="Start writing your notes..." maxLength={100000} disabled={!board} aria-label="Notes document" />
        </div>
      </section>

      <aside className="secure-scratchpad">
        <div className="scratchpad-heading"><span className="scratch-lock">◆</span><div><strong>Private scratchpad</strong><span>Stored in your signed-in workspace</span></div></div>
        <textarea value={scratchBody} onChange={(event) => { setScratchBody(event.target.value); setScratchDirty(true); }} placeholder="Keep temporary text, snippets, IDs, or private working notes here..." maxLength={50000} disabled={!board} aria-label="Private scratchpad" />
        <div className="scratchpad-footer"><span>{scratchBody.length.toLocaleString()} characters</span><span className={scratchStatus === "Not saved" ? "save-state error" : "save-state"}>{scratchStatus}</span></div>
      </aside>
    </div>
  );
}
