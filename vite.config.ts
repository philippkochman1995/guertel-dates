import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const rawBase = process.env.VITE_BASE_PATH?.trim() || "/";
const withLeadingSlash = rawBase.startsWith("/") ? rawBase : `/${rawBase}`;
const normalizedBase = withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: normalizedBase,
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
