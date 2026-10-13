import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.boardarabia.app',
  appName: 'Board Arabia',
  webDir: 'dist',
  plugins: {
    SystemBars: {
      // Light icons on the brand indigo bar.
      style: 'DARK',
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
  },
}

export default config
