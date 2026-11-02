import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const widgetDir = join(root, "..", "widget");
const dist = join(root, "dist");

execSync("node build.mjs", { cwd: widgetDir, stdio: "inherit" });

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const staticFiles = ["index.html", "styles.css", "app.js", "hero.js", "boot.js"];
for (const file of staticFiles) {
  copyFileSync(join(root, file), join(dist, file));
}
copyFileSync(join(widgetDir, "dist", "widget.js"), join(dist, "widget.js"));

// LANDING_DASHBOARD_URL points sign-in buttons at a hosted dashboard. Setting it to an
// empty string (a public build with no dashboard) sends sign-up to the self-hosting guide.
if (process.env.LANDING_DASHBOARD_URL !== undefined) {
  const page = join(dist, "index.html");
  const url = process.env.LANDING_DASHBOARD_URL.replace(/"/g, "");
  writeFileSync(page, readFileSync(page, "utf8").replace('<html lang="zh-TW" data-theme="dark">', `<html lang="zh-TW" data-theme="dark" data-dashboard="${url}">`));
}

console.log(`landing built to ${dist}`);
