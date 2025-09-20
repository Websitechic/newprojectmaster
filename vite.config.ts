
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client/src"),
      "@db": path.resolve(__dirname, "./db"),
    },
  },
  root: "./client",
  server: {
    host: "0.0.0.0",
    port: 5173,
    hmr: {
      port: 5173,
      host: "0.0.0.0"
    },
    proxy: {
      "/api": {
        target: "http://0.0.0.0:5000",
        changeOrigin: true,
        secure: false,
      },
      "/ws": {
        target: "ws://0.0.0.0:5000",
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
  },
});
