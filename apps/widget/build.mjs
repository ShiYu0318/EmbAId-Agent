import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ["src/index.ts"],
  outfile: "dist/widget.js",
  bundle: true,
  format: "iife",
  // Pages can also build their own instance: new EmbAIdWidget.ChatWidget({...}).
  globalName: "EmbAIdWidget",
  target: ["es2020"],
  platform: "browser",
  minify: !watch,
  sourcemap: watch,
  legalComments: "none",
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("watching src for changes");
} else {
  await esbuild.build(options);
  const bytes = readFileSync(options.outfile);
  const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
  console.log(`${options.outfile}  ${kb(bytes.length)} raw  ${kb(gzipSync(bytes).length)} gzip`);
}
