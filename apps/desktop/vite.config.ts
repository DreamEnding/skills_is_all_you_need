import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { execFile } from "node:child_process";
import path from "node:path";

function skillMeterDevApi() {
  return {
    name: "skill-meter-dev-api",
    configureServer(server) {
      server.middlewares.use("/api/scan-skills", (_req, res) => {
        const repoRoot = path.resolve(__dirname, "../..");
        execFile(
          "cargo",
          ["run", "--quiet", "--bin", "skill-meter", "--", "scan", "--format", "json"],
          { cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 },
          (error, stdout, stderr) => {
            if (error) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: stderr || error.message }));
              return;
            }

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(stdout);
          },
        );
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), skillMeterDevApi()],
  clearScreen: false,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
