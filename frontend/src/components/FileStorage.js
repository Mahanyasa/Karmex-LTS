import React, { useCallback, useEffect, useRef, useState } from "react";
import api from "../api";
import { useNotifications } from "../context/NotificationContext";

function formatSize(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function fileKind(name) {
  const extension = name.split(".").pop()?.toUpperCase();
  return extension && extension !== name.toUpperCase() ? extension.slice(0, 4) : "FILE";
}

export default function FileStorage() {
  const { notify, confirm } = useNotifications();
  const inputRef = useRef(null);
  const [folder, setFolder] = useState("");
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [newFolder, setNewFolder] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const setMessage = useCallback((message) => {
    if (!message) return;
    notify(message, /failed|error/i.test(message) ? "error" : "success");
  }, [notify]);

  const loadFiles = useCallback(async (nextFolder = folder) => {
    setLoading(true);
    try {
      const { data } = await api.get("/files", { params: { folder: nextFolder } });
      setFolder(data.folder || "");
      setFolders(data.folders || []);
      setFiles(data.files || []);
      setMessage("");
    } catch (err) {
      setMessage(err.response?.data?.message || "Failed to load files");
    } finally {
      setLoading(false);
    }
  }, [folder, setMessage]);

  useEffect(() => {
    loadFiles("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function uploadFiles(selectedFiles) {
    const batch = Array.from(selectedFiles || []);
    if (!batch.length) return;

    setUploading(true);
    setMessage("");
    try {
      for (const file of batch) {
        const contentType = file.type || "application/octet-stream";
        const { data } = await api.post("/files/upload-url", {
          fileName: file.name,
          contentType,
          size: file.size,
          folder: folder || undefined,
        });
        const response = await fetch(data.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: file,
        });
        if (!response.ok) throw new Error(`Upload failed for ${file.name}`);
      }
      setMessage(`${batch.length} file${batch.length === 1 ? "" : "s"} uploaded securely.`);
      await loadFiles(folder);
    } catch (err) {
      setMessage(err.response?.data?.message || err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function createFolder(event) {
    event.preventDefault();
    const name = newFolder.trim();
    if (!name) return;
    try {
      await api.post("/files/folders", { name });
      setNewFolder("");
      await loadFiles("");
    } catch (err) {
      setMessage(err.response?.data?.message || "Failed to create folder");
    }
  }

  async function downloadFile(file) {
    try {
      const { data } = await api.get("/files/download-url", { params: { key: file.key } });
      window.location.assign(data.downloadUrl);
    } catch (err) {
      setMessage(err.response?.data?.message || "Failed to download file");
    }
  }

  async function deleteFile(file) {
    const approved = await confirm({
      title: "Delete file?",
      message: `${file.name} will be permanently removed from private storage.`,
      confirmLabel: "Delete file",
      danger: true,
    });
    if (!approved) return;
    try {
      await api.delete("/files", { params: { key: file.key } });
      setFiles((current) => current.filter((item) => item.key !== file.key));
    } catch (err) {
      setMessage(err.response?.data?.message || "Failed to delete file");
    }
  }

  return (
    <main className="workspace file-workspace">
      <header className="workspace-header">
        <div>
          <div className="eyebrow">PRIVATE S3 STORAGE</div>
          <h1>{folder || "Your files"}</h1>
          <p>Private by default. Files are automatically organized when uploaded.</p>
        </div>
        <button type="button" className="accent-btn storage-upload-btn" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? "Uploading..." : "Upload files"}
        </button>
        <input ref={inputRef} className="hidden-file-input" type="file" multiple onChange={(event) => uploadFiles(event.target.files)} />
      </header>

      <section
        className={dragging ? "upload-zone dragging" : "upload-zone"}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); uploadFiles(event.dataTransfer.files); }}
      >
        <span className="upload-zone-icon">↑</span>
        <div><strong>Drop files here</strong><span>Up to 100 MB each. Files remain private.</span></div>
      </section>

      <div className="storage-toolbar">
        <div className="breadcrumbs">
          <button type="button" className={!folder ? "active" : ""} onClick={() => loadFiles("")}>All files</button>
          {folder && <><span>/</span><button type="button" className="active">{folder}</button></>}
        </div>
        {!folder && (
          <form className="folder-create" onSubmit={createFolder}>
            <input value={newFolder} onChange={(event) => setNewFolder(event.target.value)} placeholder="New folder" />
            <button type="submit" title="Create folder">+</button>
          </form>
        )}
      </div>

      {loading ? (
        <div className="empty-state">Loading private storage...</div>
      ) : (
        <section className="file-grid">
          {folders.map((name) => (
            <button key={name} type="button" className="folder-card" onClick={() => loadFiles(name)}>
              <span className="folder-shape" />
              <strong>{name}</strong>
              <span>Open folder</span>
            </button>
          ))}
          {files.map((file) => (
            <article key={file.key} className="file-card">
              <div className="file-preview"><span>{fileKind(file.name)}</span></div>
              <div className="file-card-body">
                <strong title={file.name}>{file.name}</strong>
                <span>{formatSize(file.size)} · {new Date(file.lastModified).toLocaleDateString()}</span>
                <div className="file-actions">
                  <button type="button" onClick={() => downloadFile(file)}>Download</button>
                  <button type="button" className="danger-action" onClick={() => deleteFile(file)}>Delete</button>
                </div>
              </div>
            </article>
          ))}
          {!folders.length && !files.length && (
            <div className="empty-state storage-empty"><span className="empty-icon">↑</span><h3>No files here yet</h3><p>Drop files above and they will be organized automatically.</p></div>
          )}
        </section>
      )}
    </main>
  );
}
