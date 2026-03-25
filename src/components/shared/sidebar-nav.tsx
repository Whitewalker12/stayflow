'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  FileText,
  Building2,
  ChevronDown,
  Check,
  LogOut,
  Menu,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { HomeStayPMSLogo } from '@/components/shared/logo'
import { createClient } from '@/lib/supabase/client'
import { usePropertyStore } from '@/stores/property-store'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import type { User } from '@supabase/supabase-js'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/bookings', label: 'Bookings', icon: CalendarDays },
  { href: '/guests', label: 'Guests', icon: Users },
  { href: '/invoices', label: 'Invoices', icon: FileText },
  { href: '/properties', label: 'Properties', icon: Building2 },
  { href: '/settings/notifications', label: 'Notifications', icon: Settings },
]

function PropertySwitcher() {
  const { properties, activePropertyId, setActiveProperty } = usePropertyStore()
  const activeProperty = properties.find((p) => p.id === activePropertyId)

  if (properties.length === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 text-left text-sm font-medium text-gray-800 group" />
        }
      >
        <div className="flex-1 min-w-0">
          <div className="truncate">{activeProperty?.name ?? 'Select property'}</div>
        </div>
        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 group-data-[popup-open]:rotate-180 transition-transform" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {properties.map((property) => (
          <DropdownMenuItem
            key={property.id}
            onClick={() => setActiveProperty(property.id)}
          >
            <Check
              className={cn(
                'w-4 h-4',
                property.id === activePropertyId ? 'opacity-100' : 'opacity-0'
              )}
            />
            <span className="truncate">{property.name}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/properties/new" />}>
          <Building2 className="w-4 h-4" />
          Add property
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <nav className="space-y-0.5">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              active
                ? 'bg-gray-900 text-white'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

function UserMenu({ user }: { user: User }) {
  const router = useRouter()
  const { reset } = usePropertyStore()
  const supabase = createClient()

  const name =
    (user.user_metadata?.full_name as string | undefined) ??
    user.phone ??
    user.email ??
    'User'

  const initials = name
    .split(' ')
    .map((w: string) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  async function handleLogout() {
    await supabase.auth.signOut()
    reset()
    router.push('/login')
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-left" />
        }
      >
        <Avatar className="w-7 h-7 shrink-0">
          <AvatarFallback className="text-xs bg-gray-200 text-gray-700">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate">{name}</div>
          {user.phone && (
            <div className="text-xs text-gray-400 truncate">{user.phone}</div>
          )}
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-red-600 focus:text-red-600"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SidebarContent({
  user,
  onNavigate,
}: {
  user: User
  onNavigate?: () => void
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center shrink-0">
            <HomeStayPMSLogo className="w-5 h-5 text-white" />
          </div>
          <span className="font-semibold text-gray-900">HomeStayPMS</span>
        </div>
      </div>

      {/* Property switcher */}
      <div className="px-3 py-3 border-b border-gray-100">
        <p className="px-3 text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
          Property
        </p>
        <PropertySwitcher />
      </div>

      {/* Nav links */}
      <div className="flex-1 px-3 py-4 overflow-y-auto">
        <NavLinks onNavigate={onNavigate} />
      </div>

      {/* User menu */}
      <div className="px-3 py-3 border-t border-gray-100">
        <UserMenu user={user} />
      </div>
    </div>
  )
}

export function DesktopSidebar({ user }: { user: User }) {
  return (
    <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-gray-200 bg-white h-screen sticky top-0">
      <SidebarContent user={user} />
    </aside>
  )
}

export function MobileSidebar({ user }: { user: User }) {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <button
            className="md:hidden p-2 rounded-lg hover:bg-gray-100 text-gray-600"
            aria-label="Open menu"
          />
        }
      >
        <Menu className="w-5 h-5" />
      </SheetTrigger>
      <SheetContent side="left" className="p-0 w-64">
        <SidebarContent user={user} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}
