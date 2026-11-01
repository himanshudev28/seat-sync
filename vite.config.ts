import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { localApiPlugin } from "./plugins/vite-local-api";

// Vite emits `<link rel="modulepreload">` for every chunk it can reach from
// the entry — including heavy route-only chunks (jspdf, qrcode, html2canvas).
// On the homepage that means downloading ~270 KB of JS the user may never
// need. This plugin filters the preload list to a critical-only whitelist.
function trimPreloads(allow: RegExp): Plugin {
  return {
    name: "trim-modulepreloads",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        return html.replace(
          /\s*<link rel="modulepreload"[^>]+>/g,
          (tag) => (allow.test(tag) ? tag : ""),
        );
      },
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Expose all .env vars (not just VITE_*) to process.env so API handlers
  // can read MONGODB_URI, JWT_SECRET, etc. during local development.
  const env = loadEnv(mode, process.cwd(), '');
  Object.assign(process.env, env);

  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [
      react(),
      mode === 'development' && localApiPlugin(),
      // Keep only critical vendor chunks in <link rel="modulepreload">.
      // Other route chunks are fetched on demand (or via our idle warm-up).
      // Drop preloads for chunks that only matter to other routes. The big
      // ones (jspdf, qrcode) shouldn't be fetched on the homepage.
      trimPreloads(/^(?!.*\/(pdf-vendor|qr-vendor|charts-vendor)-).+\.js/),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    // Pre-bundle commonly used deps so dev cold-start is fast and HMR stays warm.
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-router-dom",
        "@tanstack/react-query",
        "lucide-react",
        "date-fns",
        "clsx",
        "tailwind-merge",
      ],
    },
    esbuild: {
      // Strip console.log + debugger in production for smaller bundles + less runtime work.
      drop: mode === "production" ? ["console", "debugger"] : [],
      legalComments: "none",
    },
    build: {
      // Modern browsers — smaller, faster output (~10-20% smaller than es2015 default).
      target: "es2020",
      cssCodeSplit: true,
      sourcemap: false,
      chunkSizeWarningLimit: 600,
      // Drop runtime preload of route-only heavy chunks (jspdf, qrcode,
      // recharts) when other routes are warmed — they're only ever needed on
      // the page that imports them.
      modulePreload: {
        resolveDependencies: (_filename, deps) =>
          deps.filter((d) => !/(pdf-vendor|qr-vendor|charts-vendor)-/.test(d)),
      },
      // Manual chunking is tricky: any lib that consumes React via CJS interop
      // breaks if it lands in a chunk that loads before React's exports are
      // ready ("Cannot read properties of undefined (reading 'forwardRef')").
      // Strategy: only split self-contained, route-specific deps. Everything
      // else (React + all React-aware libs) stays together so the binding is
      // always in scope when needed.
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Vite's lazy-import helper is used by every chunk: keep it with React, never in a
            // heavy route chunk (or the entry would statically pull that chunk in).
            if (id.includes("vite/preload-helper") || id.includes("commonjsHelpers")) return "react-vendor";
            if (!id.includes("node_modules")) return;

            // React and the tiny libs everything shares get their own chunk. Before, Rollup put them
            // in charts-vendor (recharts needs them), so the entry statically imported charts AND
            // pdf: ~420 KB gzip on every page, hidden by trimPreloads (found by macapp-67). Every
            // consumer imports this chunk statically, so React always evaluates first (no
            // forwardRef-undefined crash).
            if (/node_modules\/(react|react-dom|scheduler|react-is|prop-types|clsx|@babel\/runtime|tslib)\//.test(id)) {
              return "react-vendor";
            }

            // PDF + canvas, with every jspdf dependency, so none of them lands in a shared chunk.
            // Only TicketGenerator imports it, dynamically.
            if (
              /node_modules\/(jspdf|html2canvas|dompurify|fflate|canvg|pako|fast-png|iobuffer|core-js|raf|rgbcolor|stackblur-canvas|svg-pathdata|text-segmentation|css-line-break|utrie|base64-arraybuffer|performance-now)\//.test(id)
            ) {
              return "pdf-vendor";
            }

            // QR code: Scanner + TicketGenerator only.
            if (id.includes("/qrcode") || id.includes("/html5-qrcode/")) return "qr-vendor";

            // Charts: Admin only (lazy).
            if (id.includes("/recharts/") || id.includes("/d3-") || id.includes("/victory-vendor/")) return "charts-vendor";

            // Everything else stays in the chunks Vite generates per dynamic-import boundary.
            return;
          },
        },
      },
    },
  };
});
