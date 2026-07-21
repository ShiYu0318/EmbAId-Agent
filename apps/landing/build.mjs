import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const widgetDir = join(root, "..", "widget");
const dist = join(root, "dist");

execSync("node build.mjs", { cwd: widgetDir, stdio: "inherit" });

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const staticFiles = ["index.html", "styles.css", "app.js", "boot.js"];
for (const file of staticFiles) {
  copyFileSync(join(root, file), join(dist, file));
}
copyFileSync(join(widgetDir, "dist", "widget.js"), join(dist, "widget.js"));

console.log(`landing built to ${dist}`);
