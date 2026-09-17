const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const auth = require("../middleware/auth");

const router = express.Router();
const GITHUB_API = "https://api.github.com";

function getConfig() {
  const missing = ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"].filter(
    (name) => !process.env[name]
  );
  if (missing.length) {
    throw new Error(`Missing GitHub configuration: ${missing.join(", ")}`);
  }

  const baseUrl = (process.env.APP_BASE_URL || "http://localhost:3001")
    .trim()
    .replace(/\/$/, "");
  const callbackUrl =
    process.env.GITHUB_CALLBACK_URL || `${baseUrl}/api/github/callback`;

  return {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackUrl,
  };
}

function frontendUrl() {
  return (process.env.CLIENT_ORIGIN || "http://localhost:3000")
    .split(",")[0]
    .trim()
    .replace(/\/$/, "");
}

async function githubFetch(path, token) {
  const response = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Karmex-LTS",
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data.message || `GitHub request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

async function githubPaginate(path, token, maxPages = 10) {
  const items = [];
  const separator = path.includes("?") ? "&" : "?";
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await githubFetch(`${path}${separator}per_page=100&page=${page}`, token);
    items.push(...batch);
    if (batch.length < 100) break;
  }
  return items;
}

async function requireConnection(userId) {
  const user = await User.findById(userId).select("githubConnection githubConnected");
  if (!user?.githubConnected || !user.githubConnection?.accessToken) {
    const error = new Error("Connect GitHub from Settings first");
    error.status = 409;
    throw error;
  }
  return user;
}

router.get("/auth-url", auth, (req, res) => {
  try {
    const config = getConfig();
    const state = jwt.sign({ userId: req.userId }, process.env.JWT_SECRET, {
      expiresIn: "10m",
    });
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.callbackUrl,
      scope: "repo read:org read:user",
      state,
    });
    res.json({ url: `https://github.com/login/oauth/authorize?${params}` });
  } catch (err) {
    res.status(503).json({ message: err.message });
  }
});

router.get("/callback", async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect(`${frontendUrl()}/?github=denied`);

  try {
    const config = getConfig();
    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.callbackUrl,
      }),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || tokenData.error || !tokenData.access_token) {
      throw new Error(tokenData.error_description || "GitHub token exchange failed");
    }

    const profile = await githubFetch("/user", tokenData.access_token);
    await User.findByIdAndUpdate(decoded.userId, {
      githubConnected: true,
      githubConnection: {
        accessToken: tokenData.access_token,
        scope: tokenData.scope || null,
        tokenType: tokenData.token_type || "bearer",
        login: profile.login,
        avatarUrl: profile.avatar_url,
      },
    });

    res.redirect(`${frontendUrl()}/?github=connected`);
  } catch (err) {
    console.error("[github] OAuth callback failed:", err.message);
    res.redirect(`${frontendUrl()}/?github=error`);
  }
});

router.get("/status", auth, async (req, res) => {
  const user = await User.findById(req.userId).select("githubConnection githubConnected");
  res.json({
    connected: Boolean(user?.githubConnected),
    login: user?.githubConnection?.login || null,
    avatarUrl: user?.githubConnection?.avatarUrl || null,
  });
});

router.post("/disconnect", auth, async (req, res) => {
  await User.findByIdAndUpdate(req.userId, {
    githubConnected: false,
    githubConnection: {
      accessToken: null,
      scope: null,
      tokenType: null,
      login: null,
      avatarUrl: null,
    },
  });
  res.json({ connected: false });
});

router.get("/dashboard", auth, async (req, res) => {
  try {
    const user = await requireConnection(req.userId);
    const token = user.githubConnection.accessToken;
    const [profile, organizations, repositories] = await Promise.all([
      githubFetch("/user", token),
      githubPaginate("/user/orgs", token),
      githubPaginate(
        "/user/repos?sort=pushed&direction=desc&visibility=all&affiliation=owner,collaborator,organization_member",
        token
      ),
    ]);

    const activeRepositories = repositories.slice(0, 12);
    const activity = await Promise.all(
      activeRepositories.map(async (repository) => {
        const base = `/repos/${repository.full_name}`;
        const [pulls, issues, commits] = await Promise.all([
          githubFetch(`${base}/pulls?state=all&sort=updated&direction=desc&per_page=5`, token),
          githubFetch(`${base}/issues?state=all&sort=updated&direction=desc&per_page=5`, token),
          githubFetch(`${base}/commits?per_page=5`, token).catch(() => []),
        ]);
        return {
          repository: repository.full_name,
          pulls,
          issues: issues.filter((issue) => !issue.pull_request),
          commits,
        };
      })
    );

    const pulls = activity
      .flatMap((item) => item.pulls.map((pull) => ({ ...pull, repository: item.repository })))
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, 30);
    const issues = activity
      .flatMap((item) => item.issues.map((issue) => ({ ...issue, repository: item.repository })))
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, 30);
    const commits = activity
      .flatMap((item) =>
        item.commits.map((commit) => ({ ...commit, repository: item.repository }))
      )
      .sort(
        (a, b) =>
          new Date(b.commit?.author?.date || 0) - new Date(a.commit?.author?.date || 0)
      )
      .slice(0, 30);

    res.json({
      profile: {
        login: profile.login,
        name: profile.name,
        avatarUrl: profile.avatar_url,
        followers: profile.followers,
        following: profile.following,
        publicRepos: profile.public_repos,
      },
      organizations: organizations.map((org) => ({
        login: org.login,
        avatarUrl: org.avatar_url,
      })),
      repositories: repositories.map((repo) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        owner: repo.owner.login,
        private: repo.private,
        archived: repo.archived,
        language: repo.language,
        defaultBranch: repo.default_branch,
        openIssues: repo.open_issues_count,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        pushedAt: repo.pushed_at,
        htmlUrl: repo.html_url,
      })),
      pulls: pulls.map((pull) => ({
        id: pull.id,
        number: pull.number,
        title: pull.title,
        state: pull.state,
        draft: pull.draft,
        merged: Boolean(pull.merged_at),
        updatedAt: pull.updated_at,
        author: pull.user?.login,
        repository: pull.repository,
        htmlUrl: pull.html_url,
      })),
      issues: issues.map((issue) => ({
        id: issue.id,
        number: issue.number,
        title: issue.title,
        state: issue.state,
        updatedAt: issue.updated_at,
        author: issue.user?.login,
        repository: issue.repository,
        htmlUrl: issue.html_url,
      })),
      commits: commits.map((commit) => ({
        sha: commit.sha,
        message: commit.commit?.message?.split("\n")[0] || "Commit",
        author: commit.author?.login || commit.commit?.author?.name,
        date: commit.commit?.author?.date,
        repository: commit.repository,
        htmlUrl: commit.html_url,
      })),
      activityCoverage: activeRepositories.length,
    });
  } catch (err) {
    console.error("[github] Dashboard failed:", err.message);
    res.status(err.status || 500).json({ message: err.message || "Failed to load GitHub" });
  }
});

module.exports = router;
