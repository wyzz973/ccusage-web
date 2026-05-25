import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:47821", changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    // R2.1 — bundle recovery for spec-v2 §1.3 (≤+12 KB gz cap). Split the
    // heaviest libraries into their own chunks so the entry bundle stops
    // ballooning every time a new surface touches recharts/framer/Radix.
    // Side benefit: long-lived browser caches don't bust on every UI tweak.
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules")) {
            if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
            if (id.includes("framer-motion")) return "vendor-framer";
            // Split each Radix package that's used by a lazy chunk so it
            // travels with the lazy chunk that needs it instead of bloating
            // the initial bundle. Anything not pinned here lands in
            // vendor-radix (eager — react-tabs + react-slot for ViewToggle).
            if (id.includes("@radix-ui/react-dialog")) return "vendor-radix-dialog";
            if (id.includes("@radix-ui/react-popover")) return "vendor-radix-popover";
            if (id.includes("@radix-ui")) return "vendor-radix";
            if (id.includes("lucide-react")) return "vendor-icons";
            if (id.includes("react-dom") || /[\\/]react[\\/]/.test(id) || id.includes("scheduler")) return "vendor-react";
          }
          return undefined;
        },
      },
    },
  },
});
