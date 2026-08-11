import { vlyPlugin } from "@vly-ai/integrations";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), vlyPlugin(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Force a single copy of React across all packages (including vlyPlugin).
    // Without this, @vly-ai/integrations can resolve its own React copy, which
    // triggers "Invalid hook call" errors at runtime.
    dedupe: ["react", "react/jsx-runtime", "react-dom", "react-dom/client"],
  },
  build: {
    // Enable source maps for better debugging (disable in production if needed)
    sourcemap: false,
    // Optimize chunk splitting
    rollupOptions: {
      output: {
        // Manual chunk splitting for better caching and lazy loading
        manualChunks: {
          // Vendor chunks for large libraries
          'react-vendor': ['react', 'react-dom', 'react-router'],
          'convex-vendor': ['convex'],
          // Large UI library chunks
          'radix-ui': [
            '@radix-ui/react-accordion',
            '@radix-ui/react-alert-dialog',
            '@radix-ui/react-avatar',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-collapsible',
            '@radix-ui/react-context-menu',
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-hover-card',
            '@radix-ui/react-label',
            '@radix-ui/react-menubar',
            '@radix-ui/react-navigation-menu',
            '@radix-ui/react-popover',
            '@radix-ui/react-progress',
            '@radix-ui/react-radio-group',
            '@radix-ui/react-scroll-area',
            '@radix-ui/react-select',
            '@radix-ui/react-separator',
            '@radix-ui/react-slider',
            '@radix-ui/react-switch',
            '@radix-ui/react-tabs',
            '@radix-ui/react-toggle',
            '@radix-ui/react-toggle-group',
            '@radix-ui/react-tooltip',
          ],
          // Heavy optional libraries - separate chunks for better lazy loading
          'framer-motion': ['framer-motion'],
          'charts': ['recharts'],
          'forms': ['react-hook-form', '@hookform/resolvers', 'zod'],
        },
        // Optimize chunk size
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    // Increase chunk size warning limit for better chunking
    chunkSizeWarningLimit: 1000,
    // Target modern browsers for better optimization
    target: 'esnext',
    // Minify options - using esbuild (faster than terser)
    minify: 'esbuild',
  },
  // Optimize dependencies
  optimizeDeps: {
    // Only scan the app entry HTML; avoids crawling unrelated *.html files
    // if a legacy snapshot accidentally contains leaked package folders.
    entries: ['index.html'],
    // Prebundle the app's core + shadcn/ui dependency surface at startup so
    // route navigation never triggers a mid-session dependency re-optimization
    // (which historically produced "Failed to fetch dynamically imported
    // module" errors when the optimizer regenerated ?v= hashes mid-navigation).
    //
    // Keep this list scoped to entry-graph + shared UI deps. Heavy packages
    // used ONLY by lazy routes are intentionally omitted — see the note below
    // the list — so dev-server cold starts stay fast enough for the preview.
    include: [
      // React core + renderers
      'react',
      'react/jsx-runtime',
      'react-dom',
      'react-dom/client',
      // Router, auth, backend client
      'react-router',
      '@convex-dev/auth/react',
      'convex/react',
      // Radix UI primitives (all shadcn/ui components use these)
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-aspect-ratio',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-collapsible',
      '@radix-ui/react-context-menu',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-hover-card',
      '@radix-ui/react-label',
      '@radix-ui/react-menubar',
      '@radix-ui/react-navigation-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-progress',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slider',
      '@radix-ui/react-slot',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toggle',
      '@radix-ui/react-toggle-group',
      '@radix-ui/react-tooltip',
      // UI / logic libraries
      'class-variance-authority',
      'clsx',
      'tailwind-merge',
      'lucide-react',
      'sonner',
      'next-themes',
      'framer-motion',
      'date-fns',
      // Platform integrations (Vly toolbar + telemetry)
      '@vly-ai/integrations',
      '@zumer/snapdom',
    ],
    // Heavy packages that are ONLY imported by lazy-loaded routes (LiveKit
    // video on /emergency/:id, recharts on /admin, forms on /contacts and
    // /profile, and the calendar/carousel/command/drawer/otp/resizable UI
    // components) are deliberately NOT pre-bundled here. Pre-bundling them at
    // startup made dev-server cold starts take minutes on Freebuff's 1-core
    // preview sandbox, which caused "Initializing project… Step 2 of 4" stalls
    // and "Preview unavailable" (dev server never became ready). Vite discovers
    // them on first navigation and optimizes incrementally; the recoverableLazy
    // route loader in src/main.tsx retries once and reloads once if a chunk
    // fetch races the optimizer, so navigation self-heals without a full
    // pre-bundle on every boot.
  },
  // Performance hints
  server: {
    // Bind to all interfaces so WebContainer's server-ready event fires.
    host: true,
    port: 5173,
    // HMR stays disabled: Freebuff preview environments require `hmr: false`
    // (an `hmr: { ... }` object breaks the managed dev server). File edits are
    // picked up automatically by the platform's managed server restart.
    hmr: false,
  },
});
