import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
  },
  plugins: [react()],
});
