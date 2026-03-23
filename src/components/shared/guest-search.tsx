'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { Users, ChevronDown, Plus, X, RefreshCw } from 'lucide-react'
import type { Guest } from '@/types'

interface GuestSearchProps {
  /** Currently selected guest (controlled) */
  value?: Guest | null
  onChange: (guest: Guest | null) => void
  /** Show "Create new guest" option — opens a new tab */
  allowCreate?: boolean
  placeholder?: string
  disabled?: boolean
}

export function GuestSearch({
  value,
  onChange,
  allowCreate = true,
  placeholder = 'Search by name or phone…',
  disabled = false,
}: GuestSearchProps) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Guest[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(
    async (q: string) => {
      setLoading(true)
      let req = supabase
        .from('guests')
        .select('*')
        .is('deleted_at', null)
        .order('full_name')
        .limit(20)

      if (q.trim()) {
        req = req.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`)
      }

      const { data } = await req
      setResults((data ?? []) as Guest[])
      setLoading(false)
    },
    [supabase]
  )

  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(query), 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, open, search])

  // Load initial results when popover opens
  useEffect(() => {
    if (open && results.length === 0 && !query) {
      search('')
    }
  }, [open, results.length, query, search])

  function handleSelect(guest: Guest) {
    onChange(guest)
    setOpen(false)
    setQuery('')
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation()
    onChange(null)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {value ? (
          <span className="flex items-center gap-2 min-w-0">
            <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600 shrink-0">
              {value.full_name.charAt(0).toUpperCase()}
            </div>
            <span className="truncate text-gray-900">{value.full_name}</span>
            {value.phone && (
              <span className="text-gray-400 text-xs shrink-0 hidden sm:inline">
                {value.phone}
              </span>
            )}
            <Badge
              variant="outline"
              className="text-blue-600 border-blue-200 bg-blue-50 text-xs shrink-0 hidden sm:inline-flex"
            >
              <RefreshCw className="w-2.5 h-2.5 mr-1" />
              Returning
            </Badge>
          </span>
        ) : (
          <span className="flex items-center gap-2 text-gray-400">
            <Users className="w-4 h-4 shrink-0" />
            <span className="truncate">{placeholder}</span>
          </span>
        )}
        <span className="flex items-center gap-1 ml-auto shrink-0">
          {value && (
            <span
              role="button"
              aria-label="Clear"
              onClick={handleClear}
              className="rounded-full hover:bg-gray-100 p-0.5"
            >
              <X className="w-3.5 h-3.5 text-gray-400" />
            </span>
          )}
          <ChevronDown className="w-4 h-4 text-gray-400 opacity-50" />
        </span>
      </PopoverTrigger>

      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search by name or phone…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {loading ? (
              <div className="py-6 text-center text-sm text-gray-400">Searching…</div>
            ) : (
              <>
                <CommandEmpty>
                  <div className="py-4 text-center text-sm text-gray-500">
                    No guests found
                    {query && (
                      <span className="block text-xs text-gray-400 mt-0.5">
                        for &ldquo;{query}&rdquo;
                      </span>
                    )}
                  </div>
                </CommandEmpty>

                {results.length > 0 && (
                  <CommandGroup>
                    {results.map((guest) => (
                      <CommandItem
                        key={guest.id}
                        value={guest.id}
                        onSelect={() => handleSelect(guest)}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600 shrink-0">
                          {guest.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {guest.full_name}
                          </p>
                          {guest.phone && (
                            <p className="text-xs text-gray-400">{guest.phone}</p>
                          )}
                        </div>
                        {guest.phone && query && (
                          <Badge
                            variant="outline"
                            className="text-blue-600 border-blue-200 bg-blue-50 text-xs shrink-0"
                          >
                            <RefreshCw className="w-2.5 h-2.5 mr-1" />
                            Returning
                          </Badge>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {allowCreate && (
                  <CommandGroup>
                    <CommandItem
                      value="__create__"
                      onSelect={() => {
                        window.open('/guests/new', '_blank')
                        setOpen(false)
                      }}
                      className="flex items-center gap-2 cursor-pointer text-blue-600"
                    >
                      <Plus className="w-4 h-4" />
                      <span className="text-sm">
                        {query
                          ? `Create "${query}" as new guest`
                          : 'Create new guest'}
                      </span>
                    </CommandItem>
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
