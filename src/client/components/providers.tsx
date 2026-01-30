import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { HeroUIProvider } from "@heroui/react"
import type { SessionValidationResult } from "@/shared/types"
import { useSessionStore } from "@/client/state/session"
import { Suspense, useEffect, useRef, RefObject, useCallback } from "react"
import { useConfigStore } from "@/client/state/config"
import type { getConfig } from "@/server/utils/flags"
import { EmailVerificationDialog } from "./email-verification-dialog"
import { useLocation } from "@tanstack/react-router"
import { useEventListener, useDebounceCallback } from 'usehooks-ts';

function RouterChecker() {
  const location = useLocation();
  const fetchSession = useSessionStore((store) => store.fetchSession)

  useEffect(() => {
    fetchSession?.();
  }, [location.pathname, location.search, fetchSession]);

  return null;
}

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  const setSession = useSessionStore((store) => store.setSession)
  const setConfig = useConfigStore((store) => store.setConfig)
  const refetchSession = useSessionStore((store) => store.refetchSession)
  const clearSession = useSessionStore((store) => store.clearSession)
  const documentRef = useRef(typeof window === 'undefined' ? null : document)
  const windowRef = useRef(typeof window === 'undefined' ? null : window)

  const doFetchSession = useCallback(async () => {
    try {
      refetchSession() // Set loading state before fetch
      const response = await fetch('/api/auth/session')
      const sessionWithConfig = await response.json() as {
        session: SessionValidationResult
        config: Awaited<ReturnType<typeof getConfig>>
      }

      setConfig(sessionWithConfig?.config)

      if (sessionWithConfig?.session) {
        setSession(sessionWithConfig?.session)
      } else {
        clearSession()
      }
    } catch (error) {
      console.error('Failed to fetch session:', error)
      clearSession()
    }
  }, [setSession, setConfig, clearSession, refetchSession])

  const fetchSession = useDebounceCallback(doFetchSession, 30)

  // Initial fetch on mount
  useEffect(() => {
    fetchSession()
  }, [fetchSession])

  // Handle refetches
  useEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      fetchSession()
    }
  }, documentRef as RefObject<Document>)

  useEventListener('focus', () => {
    fetchSession()
    // @ts-expect-error window is not defined in the server
  }, windowRef)

  // Add fetchSession to the session store
  useEffect(() => {
    useSessionStore.setState({ fetchSession: doFetchSession })
  }, [doFetchSession])

  return (
    <HeroUIProvider>
      <Suspense>
        <RouterChecker />
      </Suspense>
      <NextThemesProvider {...props} attribute="class">
        {children}
        <EmailVerificationDialog />
      </NextThemesProvider>
    </HeroUIProvider>
  )
}
