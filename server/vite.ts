
import { promises as fs } from "fs";
import path from "path";
import { Server } from "http";
import type { Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";

// Get the directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const viteConfig = {
  root: path.resolve(__dirname, "..", "client"),
  server: {
    host: "0.0.0.0",
    port: 5000,
    hmr: {
      port: 5000,
      host: "0.0.0.0"
    }
  },
  build: {
    outDir: path.resolve(__dirname, "..", "dist", "public"),
    emptyOutDir: true,
  },
};

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        // Don't exit on Vite errors, just log them
        log(`Vite error: ${msg}`, "vite");
      },
    },
    server: {
      middlewareMode: true,
      hmr: { 
        server,
        port: 5000,
        host: "0.0.0.0"
      },
    },
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        __dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.readFile(clientTemplate, "utf-8");
      template = template.replace(`src="/src/main.tsx"`, `src="/src/main.tsx?v=${nanoid()}"`)
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");

  if (!fs.stat(distPath).catch(() => false)) {
    throw new Error(
      `Static files not found at ${distPath}. Run \`npm run build\` first.`,
    );
  }

  app.use(express.static(distPath));
  app.use("*", (req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
