// Fail the build without ever reporting a matching value, snippet or partially masked key.
const fs = require("node:fs");
const path = require("node:path");

const privateNames = ["OPENAI_API_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY",
  "ANTHROPIC_API_KEY", "ELEVENLABS_API_KEY"];
const credentials = [
  /\bsk-(?:(?:proj|svcacct|admin)-)?[A-Za-z0-9_-]{28,}/,
  /\bsb_secret_[A-Za-z0-9_-]{16,}/, /\bre_[A-Za-z0-9_-]{24,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{32,}/,
];
function rules(env) {
  const publicName = /^NEXT_PUBLIC_/;
  const publishable = /(?:PUBLISHABLE|SUPABASE_ANON_KEY|PUBLIC_KEY)$/;
  const secretName = /(?:API_KEY|SECRET(?:_KEY)?|SERVICE_ROLE(?:_KEY)?|PRIVATE_KEY|PASSWORD|ACCESS_TOKEN|REFRESH_TOKEN)$/;
  const invalid = Object.keys(env).some(name => env[name] && publicName.test(name) &&
    !publishable.test(name) && (secretName.test(name) || privateNames.includes(name.slice("NEXT_PUBLIC_".length))));
  const needles = privateNames.map(name => env[name]).filter(s => s && s.length >= 8)
    .flatMap(s => [...new Set([s, JSON.stringify(s).slice(1, -1), encodeURIComponent(s), Buffer.from(s).toString("base64")])]);
  return { invalid, matches(bytes) {
    if (needles.some(value => bytes.includes(value))) return true;
    const data = bytes.toString("utf8");
    if (credentials.some(re => re.test(data))) return true;
    for (const m of data.matchAll(/\beyJ[\w-]+\.(eyJ[\w-]+)\.[\w-]+/g)) {
      try { if (JSON.parse(Buffer.from(m[1], "base64url").toString()).role === "service_role") return true; } catch {}
    }
    return false;
  } };
}
function check(root = process.cwd(), env = process.env) {
  const { invalid, matches } = rules(env);
  if (invalid) throw new Error("A private credential is configured as NEXT_PUBLIC_. Remove the public variable.");
  let files = 0;
  const visited = new Set();
  function walk(relative, all, fromPublic = false) {
    const file = path.join(root, relative);
    if (!fs.existsSync(file)) return;
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) {
      // Do not allow public assets to point out of the directory being audited.
      if (fromPublic) throw new Error("Refusing a symlink in public assets.");
      return;
    }
    if (stat.isDirectory()) { for (const n of fs.readdirSync(file)) walk(path.join(relative, n), all, fromPublic); return; }
    if (!stat.isFile() || (!all && !/\.(?:html?|rsc|body|txt|json)$/.test(relative)) || visited.has(file)) return;
    visited.add(file); files++;
    if (matches(fs.readFileSync(file))) throw new Error("A credential was found in a public build file. Deployment stopped.");
  }
  walk("public", true, true);
  walk(".next/static", true);
  walk(".next/server/app", false);
  walk(".next/server/pages", false);
  return files;
}
if (require.main === module) {
  try { console.log("Checked " + check() + " public files for credentials."); }
  catch (err) { console.error(err.message); process.exitCode = 1; }
}
module.exports = { check, rules };
