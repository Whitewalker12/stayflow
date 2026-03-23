'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { MobileSidebar } from './sidebar-nav'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { User } from '@supabase/supabase-js'

const PAGE_META: Record<string, { title: string; action?: { label: string; href: string } }> = {
  '/dashboard': { title: 'Dashboard' },
  '/bookings': {
    title: 'Bookings',
    action: { label: 'New booking', href: '/bookings/new' },
  },
  '/guests': {
    title: 'Guests',
    action: { label: 'Add guest', href: '/guests/new' },
  },
  '/invoices': {
    title: 'Invoices',
    action: { label: 'New invoice', href: '/invoices/new' },
  },
  '/properties': {
    title: 'Properties',
    action: { label: 'Add property', href: '/properties/new' },
  },
}

function getPageMeta(pathname: string) {
  const match = Object.keys(PAGE_META)
    .sort((a, b) => b.length - a.length)
    .find((key) => pathname.startsWith(key))
  return match ? PAGE_META[match] : { title: 'StayFlow' }
}

export function DashboardTopBar({ user }: { user: User }) {
  const pathname = usePathname()
  const meta = getPageMeta(pathname)

  return (
    <header className="flex items-center gap-3 h-14 px-4 md:px-6 border-b border-gray-200 bg-white shrink-0">
      {/* Mobile hamburger */}
      <MobileSidebar user={user} />

      {/* Page title */}
      <h1 className="flex-1 text-base font-semibold text-gray-900 truncate">
        {meta.title}
      </h1>

      {/* Quick action */}
      {meta.action && (
        <Link
          href={meta.action.href}
          className={cn(buttonVariants({ size: 'sm' }), 'gap-1.5')}
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">{meta.action.label}</span>
          <span className="sm:hidden">New</span>
        </Link>
      )}
    </header>
  )
}
