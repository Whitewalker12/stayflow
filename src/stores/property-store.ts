'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Property } from '@/types'
import type { SupabaseClient } from '@supabase/supabase-js'

type PropertyStore = {
  activePropertyId: string | null
  properties: Property[]
  setActiveProperty: (id: string | null) => void
  setProperties: (properties: Property[]) => void
  fetchProperties: (supabase: SupabaseClient) => Promise<void>
  reset: () => void
}

export const usePropertyStore = create<PropertyStore>()(
  persist(
    (set) => ({
      activePropertyId: null,
      properties: [],

      setActiveProperty: (id) => set({ activePropertyId: id }),

      setProperties: (properties) =>
        set((state) => ({
          properties,
          // Auto-select first property if none selected or active is gone
          activePropertyId:
            state.activePropertyId &&
            properties.some((p) => p.id === state.activePropertyId)
              ? state.activePropertyId
              : (properties[0]?.id ?? null),
        })),

      fetchProperties: async (supabase) => {
        const { data, error } = await supabase
          .from('properties')
          .select('*')
          .is('deleted_at', null)
          .order('created_at', { ascending: true })

        if (error) {
          console.error('Failed to fetch properties:', error.message)
          return
        }

        set((state) => ({
          properties: data ?? [],
          activePropertyId:
            state.activePropertyId &&
            (data ?? []).some((p: Property) => p.id === state.activePropertyId)
              ? state.activePropertyId
              : (data?.[0]?.id ?? null),
        }))
      },

      reset: () => set({ activePropertyId: null, properties: [] }),
    }),
    {
      name: 'stayflow-property',
      partialize: (state) => ({ activePropertyId: state.activePropertyId }),
    }
  )
)
