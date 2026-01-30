import fs from "node:fs/promises";

const GH_USER = "sergiopesch";
const GH_GRAPHQL = "https://api.github.com/graphql";

function mdEscape(s = "") {
  return String(s).replace(/\|/g, "\\|").trim();
}

function oneSentence15Words(text) {
  const raw = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const first = raw.split(/(?<=[.!?])\s+/)[0] || raw;
  const words = first.split(/\s+/).filter(Boolean);
  const clipped = words.slice(0, 15).join(" ").replace(/[.!?]$/, "");
  return clipped + (words.length > 15 ? "…" : "");
}

async function ghGraphql(query, variables = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      "Missing GITHUB_TOKEN. In GitHub Actions this is available automatically as secrets.GITHUB_TOKEN."
    );
  }

  const res = await fetch(GH_GRAPHQL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "github-profile-readme-generator",
      authorization: `bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.errors) {
    const msg = JSON.stringify(json.errors || json, null, 2);
    throw new Error(`GitHub GraphQL failed: ${res.status} ${res.statusText}\n${msg}`);
  }

  return json.data;
}

async function main() {
  const data = await ghGraphql(
    `query($login:String!) {
      user(login:$login) {
        pinnedItems(first: 25, types: REPOSITORY) {
          nodes {
            ... on Repository {
              name
              description
              url
              pushedAt
              isPrivate
              isArchived
            }
          }
        }
      }
    }`,
    { login: GH_USER }
  );

  const reposRaw = data?.user?.pinnedItems?.nodes ?? [];
  const repos = reposRaw
    .filter(Boolean)
    .filter((r) => !r.isPrivate)
    .filter((r) => !r.isArchived)
    .map((r) => ({
      name: mdEscape(r.name),
      url: r.url,
      desc: mdEscape(oneSentence15Words(r.description || "")),
      pushedAt: r.pushedAt || "",
    }))
    .sort((a, b) => (b.pushedAt || "").localeCompare(a.pushedAt || ""));

  const lines = [];

  lines.push(
    `# Hello there, I'm Sergio <img src="https://media.giphy.com/media/hvRJCLFzcasrR4ia7z/giphy.gif" width="28" alt="hi" />`
  );
  lines.push(`📍 London`);
  lines.push("");
  lines.push(`Deep in vibe-coding mode`);
  lines.push("");

  lines.push(`## Current Projects`);
  lines.push("");

  const ghFavicon = `https://github.com/favicon.ico`;

  for (const r of repos) {
    const tail = r.desc ? ` — ${r.desc}` : "";
    lines.push(
      `- <img src="${ghFavicon}" width="16" height="16" alt="" /> <a href="${r.url}"><b>${r.name}</b></a>${tail}`
    );
  }

  lines.push("");
  lines.push(`<sub>${repos.length} repos</sub>`);
  lines.push("");

  await fs.writeFile("README.md", lines.join("\n"), "utf8");
  console.log("README.md generated");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
