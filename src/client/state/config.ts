import { create } from 'zustand'
import { combine } from 'zustand/middleware'

interface Config {
  isGoogleSSOEnabled: boolean;
  isTurnstileEnabled: boolean;
  STRIPE_PUBLISHABLE_KEY?: string;
}

export const useConfigStore = create(
  combine(
    {
      isGoogleSSOEnabled: false,
      isTurnstileEnabled: false,
      config: null as Config | null,
    },
    (set) => ({
      setConfig: (config: Config) => {
        set({
          isGoogleSSOEnabled: config.isGoogleSSOEnabled,
          isTurnstileEnabled: config.isTurnstileEnabled,
          config,
        })
      },
    })
  )
)
