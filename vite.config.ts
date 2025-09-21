
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { replitVitePlugin } from "@replit/vite-plugin-runtime-error-modal";
import path from "path";

export default defineConfig({
  plugins: [react(), replitVitePlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client/src"),
    },
  },
  root: "client",
  build: {
    outDir: "../dist/public",
    emptyOutDir: true,
  },
  server: {
    host: "0.0.0.0",
    port: 5000,
    hmr: {
      port: 5000,
      host: "0.0.0.0"
    }
  },
});
