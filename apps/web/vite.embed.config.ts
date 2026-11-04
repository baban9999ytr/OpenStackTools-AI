import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
export default defineConfig({
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: "public",
    emptyOutDir: false,
    lib: {
      entry: "src/embed.tsx",
      name: "OpenStackToolsWidget",
      formats: ["iife"],
      fileName: () => "embed.js",
    },
  },
});
