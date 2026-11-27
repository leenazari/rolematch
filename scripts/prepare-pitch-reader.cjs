// Serve the document reader only to founders who select a large PDF. No CDN or third-party transfer.
const fs = require("node:fs"), path = require("node:path");
const pkg = require.resolve("pdfjs-dist/package.json"), vendor = path.dirname(pkg);
const dest = path.join(__dirname, "../public/pitch/reader", require(pkg).version);
fs.mkdirSync(dest, { recursive: true });
for (const name of ["pdf.min.mjs", "pdf.worker.min.mjs"]) fs.copyFileSync(path.join(vendor, "legacy/build", name), path.join(dest, name));
fs.copyFileSync(path.join(vendor, "LICENSE"), path.join(dest, "LICENSE"));
for (const dir of ["cmaps", "standard_fonts"]) fs.cpSync(path.join(vendor, dir), path.join(dest, dir), { recursive: true });
