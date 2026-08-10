// Runs before `next dev` / `next start` (see package.json predev/prestart).
// Picks DATABASE_URL automatically: direct office LAN if reachable,
// otherwise opens an SSH tunnel through the Ubuntu box on the same
// network as the DB and points DATABASE_URL at the local tunnel port.
import net from "node:net";
import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ENV_PATH = fileURLToPath(new URL("../.env", import.meta.url));

function readEnv() {
  const text = readFileSync(ENV_PATH, "utf8");
  const vars = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)="(.*)"$/);
    if (m) vars[m[1]] = m[2];
  }
  return { text, vars };
}

function setDatabaseUrl(text, url) {
  return text.replace(/^DATABASE_URL=".*"$/m, `DATABASE_URL="${url}"`);
}

function tcpCheck(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host, port });
    const done = (ok) => {
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(timeoutMs);
    sock.once("connect", () => done(true));
    sock.once("timeout", () => done(false));
    sock.once("error", () => done(false));
  });
}

const { text, vars } = readEnv();
const officeUrl = vars.DATABASE_URL_OFFICE;
const tunnelUrl = vars.DATABASE_URL_TUNNEL;

if (!officeUrl || !tunnelUrl) {
  console.log("[select-db] no fallback config in .env, leaving DATABASE_URL as-is");
  process.exit(0);
}

const officeHost = new URL(officeUrl.replace("postgresql://", "http://")).hostname;
const officePort = Number(new URL(officeUrl.replace("postgresql://", "http://")).port || 5432);

const officeReachable = await tcpCheck(officeHost, officePort, 1500);

if (officeReachable) {
  console.log(`[select-db] office DB (${officeHost}:${officePort}) reachable -> direct connection`);
  writeFileSync(ENV_PATH, setDatabaseUrl(text, officeUrl));
  process.exit(0);
}

console.log(`[select-db] office DB (${officeHost}:${officePort}) unreachable -> SSH tunnel fallback`);

const tunnelPort = Number(new URL(tunnelUrl.replace("postgresql://", "http://")).port || 5432);
const tunnelUp = await tcpCheck("127.0.0.1", tunnelPort, 500);

if (!tunnelUp) {
  const { SSH_TUNNEL_HOST, SSH_TUNNEL_PORT, SSH_TUNNEL_USER, SSH_TUNNEL_PASS, SSH_TUNNEL_HOSTKEY } = vars;
  if (!SSH_TUNNEL_HOST || !SSH_TUNNEL_HOSTKEY) {
    console.error("[select-db] no SSH tunnel config in .env, cannot fall back");
    process.exit(1);
  }
  console.log(`[select-db] opening SSH tunnel via ${SSH_TUNNEL_HOST}...`);
  const child = spawn(
    "plink",
    [
      "-ssh",
      "-P", SSH_TUNNEL_PORT,
      "-batch",
      "-hostkey", SSH_TUNNEL_HOSTKEY,
      "-pw", SSH_TUNNEL_PASS,
      "-L", `${tunnelPort}:${officeHost}:${officePort}`,
      "-N",
      `${SSH_TUNNEL_USER}@${SSH_TUNNEL_HOST}`,
    ],
    { detached: true, stdio: "ignore", windowsHide: true }
  );
  child.unref();

  // wait for the tunnel to come up (poll instead of a fixed sleep)
  let up = false;
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await tcpCheck("127.0.0.1", tunnelPort, 500)) {
      up = true;
      break;
    }
  }
  if (!up) {
    console.error("[select-db] SSH tunnel did not come up in time");
    process.exit(1);
  }
}

console.log(`[select-db] using tunnel -> localhost:${tunnelPort}`);
writeFileSync(ENV_PATH, setDatabaseUrl(text, tunnelUrl));
