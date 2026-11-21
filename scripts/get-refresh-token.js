#!/usr/bin/env node
// =============================================================================
// Daily Drive — Get a new Spotify refresh token (copy/paste flow)
// =============================================================================
// Use this when the GitHub Actions run fails with
//   "invalid_grant Refresh token revoked"
// and you need a fresh value for the SPOTIFY_REFRESH_TOKEN secret.
//
// Unlike `npm run setup`, this needs no local web server, no SSH tunnel and
// no config.yaml: you approve in the browser, then paste back the URL the
// browser was redirected to (the page itself will fail to load — that's fine).
//
// Usage:
//   node scripts/get-refresh-token.js
// Credentials come from config.yaml if present, otherwise from the
// SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET env vars, otherwise you're prompted.
// =============================================================================

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const SCOPES = [
  "playlist-modify-public",
  "playlist-modify-private",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-library-read",
  "user-read-private",
  "user-read-recently-played",
  "user-top-read",
];

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));

function loadConfigCredentials() {
  const file = path.join(__dirname, "..", "config.yaml");
  if (!fs.existsSync(file)) return {};
  try {
    const yaml = require("js-yaml");
    return yaml.load(fs.readFileSync(file, "utf8"))?.spotify || {};
  } catch {
    return {};
  }
}

async function main() {
  const cfg = loadConfigCredentials();
  const clientId = process.env.SPOTIFY_CLIENT_ID || cfg.client_id || (await ask("Spotify Client ID: "));
  const clientSecret =
    process.env.SPOTIFY_CLIENT_SECRET || cfg.client_secret || (await ask("Spotify Client Secret: "));
  const redirectUri = cfg.redirect_uri || "http://127.0.0.1:8888/callback";

  const authUrl =
    "https://accounts.spotify.com/authorize?" +
    new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      scope: SCOPES.join(" "),
      redirect_uri: redirectUri,
      show_dialog: "true",
    });

  console.log("\n1) Open this URL in your browser and click Agree:\n");
  console.log(`   ${authUrl}\n`);
  console.log(`2) You'll land on ${redirectUri}?code=... — the page won't load. That's expected.`);
  const pasted = await ask("3) Paste the full URL from the address bar here: ");

  let code;
  try {
    const u = new URL(pasted);
    if (u.searchParams.get("error")) throw new Error(`Spotify returned error: ${u.searchParams.get("error")}`);
    code = u.searchParams.get("code");
  } catch (e) {
    code = pasted; // allow pasting just the code
    if (e.message.startsWith("Spotify")) throw e;
  }
  if (!code) throw new Error("No ?code= found in what you pasted.");

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${body.error}: ${body.error_description || ""}`);

  console.log("\n✅ Success! New refresh token (put this in the SPOTIFY_REFRESH_TOKEN secret):\n");
  console.log(body.refresh_token + "\n");
}

main()
  .catch((err) => {
    console.error(`\n❌ ${err.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
