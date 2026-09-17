import React, { useEffect, useMemo, useState } from "react";
import api from "../api";

function relativeDate(value) {
  if (!value) return "Unknown";
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(value).toLocaleDateString();
}

function ExternalLink({ href, children, className = "" }) {
  return <a className={className} href={href} target="_blank" rel="noreferrer">{children}</a>;
}

export default function GitHubDashboard({ connected, connectGitHub }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(connected);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview");
  const [owner, setOwner] = useState("all");

  useEffect(() => {
    if (!connected) {
      setLoading(false);
      return;
    }

    async function loadDashboard() {
      try {
        setLoading(true);
        const response = await api.get("/github/dashboard");
        setData(response.data);
        setError("");
      } catch (err) {
        setError(err.response?.data?.message || "Failed to load GitHub activity");
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, [connected]);

  const owners = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.repositories.map((repository) => repository.owner))];
  }, [data]);

  const repositories = useMemo(
    () => data?.repositories.filter((repository) => owner === "all" || repository.owner === owner) || [],
    [data, owner],
  );

  if (!connected) {
    return (
      <main className="workspace github-workspace">
        <div className="github-connect-state">
          <span className="github-mark">GH</span>
          <div className="eyebrow">GITHUB INTELLIGENCE</div>
          <h1>See your whole GitHub world.</h1>
          <p>Connect your account to track personal and organization repositories, pull requests, issues, and commits in one place.</p>
          <button type="button" className="accent-btn" onClick={connectGitHub}>Connect GitHub</button>
        </div>
      </main>
    );
  }

  if (loading) return <main className="workspace"><div className="github-loading">Loading GitHub activity...</div></main>;

  if (error) {
    return <main className="workspace"><div className="error-banner">{error}</div><button type="button" className="secondary-btn" onClick={() => window.location.reload()}>Retry</button></main>;
  }

  const openPulls = data.pulls.filter((pull) => pull.state === "open");
  const openIssues = data.issues.filter((issue) => issue.state === "open");

  return (
    <main className="workspace github-workspace">
      <header className="github-header">
        <div className="github-identity">
          <img src={data.profile.avatarUrl} alt="" />
          <div><span className="eyebrow">GITHUB INTELLIGENCE</span><h1>{data.profile.name || data.profile.login}</h1><p>@{data.profile.login} · personal and organization activity</p></div>
        </div>
        <div className="github-orgs">
          {data.organizations.map((organization) => <img key={organization.login} src={organization.avatarUrl} title={organization.login} alt={organization.login} />)}
        </div>
      </header>

      <section className="github-stats">
        <div><span>Repositories</span><strong>{data.repositories.length}</strong><small>{data.repositories.filter((repo) => repo.private).length} private</small></div>
        <div><span>Open pull requests</span><strong>{openPulls.length}</strong><small>Across recent activity</small></div>
        <div><span>Open issues</span><strong>{openIssues.length}</strong><small>Across recent activity</small></div>
        <div><span>Organizations</span><strong>{data.organizations.length}</strong><small>{data.activityCoverage} active repos scanned</small></div>
      </section>

      <div className="github-toolbar">
        <div className="github-tabs">
          {["overview", "repositories", "pulls", "issues", "commits"].map((item) => (
            <button key={item} type="button" className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>
          ))}
        </div>
        <select value={owner} onChange={(event) => setOwner(event.target.value)} aria-label="Filter repository owner">
          <option value="all">All owners</option>
          {owners.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>

      {(tab === "overview" || tab === "repositories") && (
        <section className="github-section">
          <div className="github-section-heading"><div><span className="eyebrow">REPOSITORIES</span><h2>Repository pulse</h2></div><span>{repositories.length} visible</span></div>
          <div className="repo-table">
            {repositories.map((repository) => (
              <ExternalLink key={repository.id} href={repository.htmlUrl} className="repo-row">
                <div><strong>{repository.fullName}</strong><span>{repository.private ? "Private" : "Public"}{repository.archived ? " · Archived" : ""}</span></div>
                <span className="repo-language">{repository.language || "No language"}</span>
                <span>{repository.openIssues} open</span>
                <span>{repository.stars} stars</span>
                <time>{relativeDate(repository.pushedAt)}</time>
              </ExternalLink>
            ))}
          </div>
        </section>
      )}

      {(tab === "overview" || tab === "pulls") && (
        <ActivitySection eyebrow="PULL REQUESTS" title="Pull request status" items={data.pulls} empty="No recent pull requests" render={(pull) => (
          <><span className={`gh-state ${pull.merged ? "merged" : pull.state}`}>{pull.merged ? "Merged" : pull.draft ? "Draft" : pull.state}</span><div><strong>{pull.title}</strong><span>{pull.repository} · #{pull.number} by {pull.author}</span></div><time>{relativeDate(pull.updatedAt)}</time></>
        )} />
      )}

      {(tab === "overview" || tab === "issues") && (
        <ActivitySection eyebrow="ISSUES" title="Issue status" items={data.issues} empty="No recent issues" render={(issue) => (
          <><span className={`gh-state ${issue.state}`}>{issue.state}</span><div><strong>{issue.title}</strong><span>{issue.repository} · #{issue.number} by {issue.author}</span></div><time>{relativeDate(issue.updatedAt)}</time></>
        )} />
      )}

      {(tab === "overview" || tab === "commits") && (
        <ActivitySection eyebrow="COMMITS" title="Latest code activity" items={data.commits} empty="No recent commits" render={(commit) => (
          <><span className="commit-sha">{commit.sha.slice(0, 7)}</span><div><strong>{commit.message}</strong><span>{commit.repository} · {commit.author}</span></div><time>{relativeDate(commit.date)}</time></>
        )} />
      )}
    </main>
  );
}

function ActivitySection({ eyebrow, title, items, empty, render }) {
  return (
    <section className="github-section activity-section">
      <div className="github-section-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><span>{items.length} recent</span></div>
      <div className="activity-list">
        {items.length ? items.map((item) => <ExternalLink key={item.id || item.sha} href={item.htmlUrl} className="activity-row">{render(item)}</ExternalLink>) : <div className="github-empty">{empty}</div>}
      </div>
    </section>
  );
}
