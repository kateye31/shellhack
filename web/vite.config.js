import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import fs from "node:fs";
import path from "node:path";

// The utility PDFs live in data/raw (outside the app). Serve them at /sources/ in dev
// and copy them into the build so "source PDF p.N" links work in both.
const RAW = path.resolve(import.meta.dirname, "../data/raw/Project Listings");
const SOURCES = {
  "desc.pdf": path.join(RAW, "Dominion Energy/2024-2028-2million-and-above-project-descriptions.pdf"),
  "georgia-power-irp.pdf": path.join(RAW, "Georgia Power/2025 IRP Volume 3 PUBLIC DISCLOSURE.pdf"),
};

function sourcePdfs() {
  let outDir;
  return {
    name: "gridlock-source-pdfs",
    configResolved(c) { outDir = path.resolve(c.root, c.build.outDir); },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = req.url?.match(/^\/sources\/([\w.-]+\.pdf)/);
        const file = m && SOURCES[m[1]];
        if (!file || !fs.existsSync(file)) return next();
        res.setHeader("Content-Type", "application/pdf");
        fs.createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      fs.mkdirSync(path.join(outDir, "sources"), { recursive: true });
      for (const [name, file] of Object.entries(SOURCES)) if (fs.existsSync(file)) fs.copyFileSync(file, path.join(outDir, "sources", name));
    },
  };
}

export default defineConfig({
  base: "./",
  // singlefile: inline all JS/CSS so dist/index.html also works when double-clicked (file://).
  plugins: [react(), viteSingleFile(), sourcePdfs()],
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 1000 },
});
