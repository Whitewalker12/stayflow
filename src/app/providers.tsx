'use client'

import { useState, useEffect, useRef } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePropertyStore } from '@/stores/property-store'

function AuthListener() {
  const router = useRouter()
  const { fetchProperties, reset } = usePropertyStore()
  const supabase = createClient()
  const initialized = useRef(false)

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        if (!initialized.current) {
          initialized.current = true
          await fetchProperties(supabase)
        }
      }

      if (event === 'SIGNED_OUT') {
        initialized.current = false
        reset()
        router.push('/login')
      }

      if (event === 'TOKEN_REFRESHED') {
        // Session refreshed silently — no action needed
      }
    })

    // Fetch properties on mount if already signed in
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session && !initialized.current) {
        initialized.current = true
        await fetchProperties(supabase)
      }
    })

    return () => subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            retry: 1,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <AuthListener />
      {children}
      <Toaster position="top-right" richColors closeButton />
    </QueryClientProvider>
  )
}
