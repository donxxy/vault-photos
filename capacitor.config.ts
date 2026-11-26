import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.donxxy.volta',
  appName: 'Volta',
  webDir: 'public',
  server: {
    // Use your ThinkPad's static local IP (or your Cloudflare Tunnel HTTPS URL)
    url: 'http://192.168.1.45:3000',
    cleartext: true, // Required if using http:// instead of https://
  },
};

export default config;