import React, { useEffect, useMemo, useRef, useState } from "react";
import api from "../api";
import { useNotifications } from "../context/NotificationContext";

const percent = (value) => `${Math.round((value || 0) * 100)}%`;
const number = (value) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 1 });
function fileAsBase64(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error("Could not read the workbook")); reader.onload = () => resolve(String(reader.result).split(",")[1] || ""); reader.readAsDataURL(file); }); }

export default function ResourceUtilization() {
  const { notify } = useNotifications();
  const inputRef = useRef(null);
  const [report, setReport] = useState(null);
  const [selectedMember, setSelectedMember] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => { api.get("/utilization").then(({ data }) => { setReport(data); setSelectedMember(data?.members?.[0]?.member || ""); }).catch(() => {}); }, []);
  async function upload(file) {
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) return notify("Upload an .xlsx workbook exported from Google Sheets.", "error");
    try {
      setUploading(true);
      const workbookBase64 = await fileAsBase64(file);
      const { data } = await api.post("/utilization/import", { sourceName: file.name, workbookBase64 });
      setReport(data);
      setSelectedMember(data.members[0]?.member || "");
      const stats = data.importStats;
      notify(stats ? `${stats.added} new, ${stats.updated} updated, ${stats.duplicates} duplicates skipped.` : "Workbook imported.", "success");
    } catch (err) { notify(err.response?.data?.message || err.message || "The workbook could not be imported.", "error"); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  const member = report?.members?.find((item) => item.member === selectedMember);
  const maxMemberHours = Math.max(...(report?.members || []).map((item) => item.loggedHours), 1);
  const maxProjectHours = Math.max(...(report?.projects || []).slice(0, 8).map((item) => item.hours), 1);
  const maxMonthHours = Math.max(...(report?.months || []).map((item) => item.hours), 1);
  const topElements = useMemo(() => member ? Object.entries(member.elements).sort((a, b) => b[1] - a[1]).slice(0, 6) : [], [member]);

  return <main className="utilization-page">
    <header className="utilization-header"><div><span className="eyebrow">RESOURCE INTELLIGENCE</span><h1>Team utilization</h1><p>Capacity, delivery efficiency, project allocation, and individual work patterns.</p></div><div><button type="button" className="accent-btn" onClick={() => inputRef.current?.click()} disabled={uploading}>{uploading ? "Processing workbook..." : "Upload Google Sheet"}</button><input ref={inputRef} className="hidden-file-input" type="file" accept=".xlsx" onChange={(event) => upload(event.target.files?.[0])} /></div></header>
    {!report ? <section className={dragging ? "utilization-upload dragging" : "utilization-upload"} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); upload(event.dataTransfer.files?.[0]); }}><strong>Upload your Daily Update workbook</strong><span>In Google Sheets, choose File → Download → Microsoft Excel (.xlsx), then drop it here.</span><small>Employee tabs are detected automatically. FP and generated report tabs are ignored.</small></section> : <>
      <div className="utilization-meta"><span>Source: <strong>{report.sourceName}</strong></span><span>Updated {new Date(report.updatedAt).toLocaleString()}</span><span>Basis: {report.settings.hoursPerDay} hrs/day · 6-day week</span></div>
      <section className="utilization-kpis"><Kpi label="Team utilization" value={percent(report.totals.utilization)} detail={`${number(report.totals.loggedHours)} of ${number(report.totals.capacityHours)} hrs`} /><Kpi label="Delivery efficiency" value={percent(report.totals.efficiency)} detail="Standard ÷ logged hours" /><Kpi label="Work records" value={number(report.totals.taskCount)} detail={`${report.members.length} team members`} /><Kpi label="Standard effort" value={`${number(report.totals.standardHours)}h`} detail="Elemental estimate" /></section>
      <section className="utilization-grid"><Panel title="Utilization by person" subtitle="Logged hours against active-window capacity"><div className="utilization-bars">{report.members.map((item) => <button type="button" key={item.member} className={selectedMember === item.member ? "active" : ""} onClick={() => setSelectedMember(item.member)}><span>{item.member}</span><i><b style={{ width: `${Math.min(100, item.utilization * 100)}%` }} /></i><strong>{percent(item.utilization)}</strong></button>)}</div></Panel><Panel title="Project allocation" subtitle="Estimated or logged hours by classification"><div className="project-bars">{report.projects.slice(0, 8).map((item) => <div key={item.name}><span>{item.name}</span><i><b style={{ width: `${item.hours / maxProjectHours * 100}%` }} /></i><strong>{number(item.hours)}h</strong></div>)}</div></Panel></section>
      <section className="utilization-grid lower"><Panel title="Team activity trend" subtitle="Monthly logged or active-day hours"><div className="trend-chart">{report.months.map((item) => <div key={item.month}><span>{number(item.hours)}</span><i style={{ height: `${Math.max(5, item.hours / maxMonthHours * 100)}%` }} /><small>{new Date(`${item.month}-01T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "2-digit" })}</small></div>)}</div></Panel><Panel title="Team workload" subtitle="Absolute hours by person"><div className="workload-chart">{report.members.map((item) => <div key={item.member}><i style={{ height: `${Math.max(5, item.loggedHours / maxMemberHours * 100)}%` }} /><small>{item.member}</small></div>)}</div></Panel></section>
      <section className="standards-panel"><header><div><h2>Standard-time learning</h2><span>Historical actual hours recalibrate an element after 3 matching samples.</span></div><strong>{report.standards.filter((item) => item.learned).length} learned</strong></header><div>{report.standards.map((item) => <article key={item.name} className={item.learned ? "learned" : ""}><span>{item.name}</span><strong>{number(item.hours)}h</strong><small>{item.learned ? `${item.samples} samples · baseline ${number(item.baseline)}h` : `Baseline · ${item.samples}/3 samples`}</small></article>)}</div></section>
      {member && <section className="individual-dashboard"><header><div><span className="eyebrow">INDIVIDUAL DASHBOARD</span><h2>{member.member}</h2></div><select value={selectedMember} onChange={(event) => setSelectedMember(event.target.value)}>{report.members.map((item) => <option key={item.member}>{item.member}</option>)}</select></header><div className="individual-kpis"><Kpi label="Utilization" value={percent(member.utilization)} detail={`${number(member.loggedHours)} logged hours`} /><Kpi label="Efficiency" value={percent(member.efficiency)} detail={`${number(member.standardHours)} standard hours`} /><Kpi label="Active window" value={`${member.workingDays} days`} detail={`${member.firstDate} to ${member.lastDate}`} /><Kpi label="Projects" value={member.projectCount} detail={`${member.taskCount} work records`} /></div><div className="individual-body"><div className="element-mix"><h3>Work element mix</h3>{topElements.map(([name, count]) => <div key={name}><span>{name}</span><i><b style={{ width: `${count / topElements[0][1] * 100}%` }} /></i><strong>{count}</strong></div>)}</div><div className="activity-feed"><h3>Recent work</h3>{member.entries.slice(0, 12).map((entry) => <article key={entry._id}><time>{new Date(entry.date).toLocaleDateString()}</time><div><strong>{entry.classification}</strong><p>{entry.description}</p><small>{entry.elements.join(" · ")} · {number(entry.standardHours)} standard hrs</small></div></article>)}</div></div></section>}
    </>}
  </main>;
}

function Kpi({ label, value, detail }) { return <article><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>; }
function Panel({ title, subtitle, children }) { return <article className="utilization-panel"><header><h2>{title}</h2><span>{subtitle}</span></header>{children}</article>; }
