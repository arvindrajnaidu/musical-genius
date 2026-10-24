import type { CapacitorConfig } from "@capacitor/cli";

// The phone app is the guest controller: join a room, nominate songs, vote.
// Music only ever plays on the host's TV (the web app in a TV browser), so the
// native app never embeds YouTube. `npm run build:native` produces a static
// Next.js export into `out/`, which `cap sync` copies into the native projects.
const config: CapacitorConfig = {
  appId: "com.musicalgenius.app",
  appName: "Musical Genius",
  webDir: "out",
  backgroundColor: "#1e1b4b",
  server: {
    cleartext: false,
  },
  ios: {
    contentInset: "always",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      backgroundColor: "#1e1b4b",
      showSpinner: false,
    },
  },
};

export default config;
