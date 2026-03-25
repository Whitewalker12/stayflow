'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePropertyStore } from '@/stores/property-store'
import {
  propertySchema,
  type PropertyFormData,
} from '@/lib/validations/property'
import { roomSchema, type RoomFormData } from '@/lib/validations/room'
import { INDIAN_STATES, AMENITIES } from '@/lib/constants/india'
import { formatCurrency, rupeesToPaise, paiseToRupees } from '@/lib/utils/currency'
import type { Property, Room, RoomType, RoomStatus } from '@/types'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowLeft, Plus, MoreVertical, Pencil, Trash2, Link2, Copy, Check, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { TimeSelect } from '@/components/shared/time-select'
import type { ICalConnection } from '@/types'

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return <p className="text-xs text-red-600 mt-1">{msg}</p>
}

const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  standard: 'Standard',
  deluxe: 'Deluxe',
  suite: 'Suite',
  dormitory: 'Dormitory',
}

const ROOM_STATUS_COLORS: Record<RoomStatus, string> = {
  available: 'bg-green-100 text-green-700',
  occupied: 'bg-blue-100 text-blue-700',
  maintenance: 'bg-yellow-100 text-yellow-700',
  blocked: 'bg-gray-100 text-gray-600',
}

// ─────────────────────────────────────────
// Room Dialog
// ─────────────────────────────────────────

const ROOM_INITIAL: RoomFormData = {
  name: '',
  type: 'standard',   // form field name; maps to DB column room_type on save
  base_rate: 0,       // in rupees; converted to paise on save (base_rate_paise)
  max_occupancy: 2,
  amenities: [],
  floor: undefined,   // maps to DB column floor_number on save
  description: '',
}

/** Error returned from onSave: field-level (shown inline) or generic (shown in dialog banner) */
type SaveError = { field: keyof RoomFormData; message: string } | { field?: never; message: string }

function RoomDialog({
  open,
  onOpenChange,
  editRoom,
  onSave,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editRoom: Room | null
  onSave: (data: RoomFormData) => Promise<SaveError | void>
}) {
  const [form, setForm] = useState<RoomFormData>(
    editRoom
      ? {
          name: editRoom.name,
          type: editRoom.room_type,
          base_rate: paiseToRupees(editRoom.base_rate_paise),
          max_occupancy: editRoom.max_occupancy,
          amenities: editRoom.amenities,
          floor: editRoom.floor_number ?? undefined,
          description: editRoom.description ?? '',
        }
      : ROOM_INITIAL
  )
  const [errors, setErrors] = useState<Partial<Record<keyof RoomFormData, string>>>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Reset form when dialog opens with new data
  function handleOpenChange(v: boolean) {
    if (v) {
      setForm(
        editRoom
          ? {
              name: editRoom.name,
              type: editRoom.room_type,
              base_rate: paiseToRupees(editRoom.base_rate_paise),
              max_occupancy: editRoom.max_occupancy,
              amenities: editRoom.amenities,
              floor: editRoom.floor_number ?? undefined,
              description: editRoom.description ?? '',
            }
          : ROOM_INITIAL
      )
      setErrors({})
      setSaveError(null)
    }
    onOpenChange(v)
  }

  function set<K extends keyof RoomFormData>(field: K, value: RoomFormData[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
    setSaveError(null)
  }

  function toggleAmenity(amenity: string) {
    setForm((prev) => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter((a) => a !== amenity)
        : [...prev.amenities, amenity],
    }))
  }

  async function handleSave() {
    const result = roomSchema.safeParse(form)
    if (!result.success) {
      const errs: Partial<Record<keyof RoomFormData, string>> = {}
      result.error.issues.forEach((issue) => {
        const k = issue.path[0] as keyof RoomFormData
        if (!errs[k]) errs[k] = issue.message
      })
      setErrors(errs)
      return
    }
    setSaving(true)
    const err = await onSave(result.data)
    setSaving(false)
    if (err) {
      if (err.field) {
        setErrors((prev) => ({ ...prev, [err.field!]: err.message }))
      } else {
        setSaveError(err.message)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editRoom ? 'Edit room' : 'Add room'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Server error banner */}
          {saveError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {saveError}
            </div>
          )}

          {/* Name + Type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="room-name">Name *</Label>
              <Input
                id="room-name"
                placeholder="e.g. Room 101"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                aria-invalid={!!errors.name}
              />
              <FieldError msg={errors.name} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="room-type">Type *</Label>
              <Select
                value={form.type}
                onValueChange={(v) => set('type', (v ?? 'standard') as RoomType)}
              >
                <SelectTrigger id="room-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROOM_TYPE_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError msg={errors.type} />
            </div>
          </div>

          {/* Rate + Occupancy */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="room-rate">Base rate (₹/night) *</Label>
              <div className="flex">
                <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 text-sm text-gray-500 select-none">
                  ₹
                </span>
                <Input
                  id="room-rate"
                  type="number"
                  inputMode="numeric"
                  placeholder="2500"
                  min={1}
                  value={form.base_rate || ''}
                  onChange={(e) => set('base_rate', parseFloat(e.target.value) || 0)}
                  className="rounded-l-none"
                  aria-invalid={!!errors.base_rate}
                />
              </div>
              <FieldError msg={errors.base_rate} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="room-occupancy">Max occupancy *</Label>
              <Input
                id="room-occupancy"
                type="number"
                inputMode="numeric"
                placeholder="2"
                min={1}
                max={20}
                value={form.max_occupancy || ''}
                onChange={(e) => set('max_occupancy', parseInt(e.target.value) || 1)}
                aria-invalid={!!errors.max_occupancy}
              />
              <FieldError msg={errors.max_occupancy} />
            </div>
          </div>

          {/* Floor */}
          <div className="space-y-1.5">
            <Label htmlFor="room-floor">Floor number (optional)</Label>
            <Input
              id="room-floor"
              type="number"
              inputMode="numeric"
              placeholder="1"
              min={0}
              value={form.floor ?? ''}
              onChange={(e) =>
                set('floor', e.target.value === '' ? undefined : parseInt(e.target.value))
              }
            />
          </div>

          {/* Amenities */}
          <div className="space-y-2">
            <Label>Amenities</Label>
            <div className="flex flex-wrap gap-2">
              {AMENITIES.map((amenity) => {
                const selected = form.amenities.includes(amenity)
                return (
                  <button
                    key={amenity}
                    type="button"
                    onClick={() => toggleAmenity(amenity)}
                    className={cn(
                      'text-xs px-2.5 py-1 rounded-full border transition-colors',
                      selected
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                    )}
                  >
                    {amenity}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="room-desc">Description (optional)</Label>
            <Textarea
              id="room-desc"
              placeholder="e.g. Mountain-facing room with private balcony."
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={2}
            />
            <FieldError msg={errors.description} />
          </div>
        </div>

        <DialogFooter showCloseButton>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editRoom ? 'Save changes' : 'Add room'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────
// Delete confirmation dialog
// ─────────────────────────────────────────

function DeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  description: string
  onConfirm: () => Promise<void>
}) {
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    await onConfirm()
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600">{description}</p>
        <DialogFooter showCloseButton>
          <Button variant="destructive" onClick={handleConfirm} disabled={loading}>
            {loading ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────
// Rooms tab
// ─────────────────────────────────────────

function RoomsTab({
  propertyId,
  initialRooms,
}: {
  propertyId: string
  initialRooms: Room[]
}) {
  const supabase = createClient()
  const [rooms, setRooms] = useState<Room[]>(initialRooms)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editRoom, setEditRoom] = useState<Room | null>(null)
  const [deleteRoom, setDeleteRoom] = useState<Room | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleSaveRoom(data: RoomFormData): Promise<SaveError | void> {
    const payload = {
      property_id: propertyId,
      name: data.name,
      room_type: data.type,
      base_rate_paise: rupeesToPaise(data.base_rate),
      max_occupancy: data.max_occupancy,
      amenities: data.amenities,
      floor_number: data.floor ?? null,
      description: data.description || null,
      status: 'available' as RoomStatus,
    }

    if (editRoom) {
      const { data: updated, error } = await supabase
        .from('rooms')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editRoom.id)
        .select()
        .single()

      if (error) {
        if (error.code === '23505') {
          return { field: 'name', message: 'A room with this name already exists in this property' }
        }
        return { message: error.message }
      }
      setRooms((prev) => prev.map((r) => (r.id === editRoom.id ? updated : r)))
    } else {
      const { data: created, error } = await supabase
        .from('rooms')
        .insert(payload)
        .select()
        .single()

      if (error) {
        if (error.code === '23505') {
          return { field: 'name', message: 'A room with this name already exists in this property' }
        }
        return { message: error.message }
      }
      setRooms((prev) => [...prev, created])
    }

    setDialogOpen(false)
    setEditRoom(null)
  }

  async function handleDeleteRoom() {
    if (!deleteRoom) return
    setDeleteError(null)
    const { error } = await supabase
      .from('rooms')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deleteRoom.id)

    if (error) { setDeleteError(error.message); return }
    setRooms((prev) => prev.filter((r) => r.id !== deleteRoom.id))
    setDeleteRoom(null)
  }

  async function toggleStatus(room: Room) {
    const newStatus: RoomStatus =
      room.status === 'available' ? 'blocked' : 'available'
    const { error } = await supabase
      .from('rooms')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', room.id)

    if (!error) {
      setRooms((prev) => prev.map((r) => (r.id === room.id ? { ...r, status: newStatus } : r)))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-gray-500">
          {rooms.length} {rooms.length === 1 ? 'room' : 'rooms'}
        </p>
        <Button
          size="sm"
          onClick={() => {
            setEditRoom(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="w-3.5 h-3.5" />
          Add room
        </Button>
      </div>

      {deleteError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {deleteError}
        </div>
      )}

      {rooms.length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Room</TableHead>
                <TableHead className="hidden sm:table-cell">Type</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead className="hidden sm:table-cell">Guests</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rooms.map((room) => (
                <TableRow key={room.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-gray-900">{room.name}</p>
                      {room.floor_number !== null && (
                        <p className="text-xs text-gray-400">Floor {room.floor_number}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-gray-600">
                    {ROOM_TYPE_LABELS[room.room_type]}
                  </TableCell>
                  <TableCell className="text-gray-700 font-medium">
                    {formatCurrency(room.base_rate_paise)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-gray-600">
                    {room.max_occupancy}
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => toggleStatus(room)}
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-medium transition-opacity hover:opacity-80',
                        ROOM_STATUS_COLORS[room.status]
                      )}
                    >
                      {room.status}
                    </button>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <button className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500" />
                        }
                      >
                        <MoreVertical className="w-4 h-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditRoom(room)
                            setDialogOpen(true)
                          }}
                        >
                          <Pencil className="w-4 h-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-600"
                          onClick={() => setDeleteRoom(room)}
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50">
          <p className="text-gray-500 text-sm mb-4">No rooms yet. Add rooms to this property.</p>
          <Button
            size="sm"
            onClick={() => {
              setEditRoom(null)
              setDialogOpen(true)
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            Add first room
          </Button>
        </div>
      )}

      <RoomDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editRoom={editRoom}
        onSave={handleSaveRoom}
      />

      <DeleteDialog
        open={!!deleteRoom}
        onOpenChange={(v) => !v && setDeleteRoom(null)}
        title="Delete room?"
        description={`"${deleteRoom?.name}" will be permanently removed. Any existing bookings may be affected.`}
        onConfirm={handleDeleteRoom}
      />
    </div>
  )
}

// ─────────────────────────────────────────
// iCal Sync tab
// ─────────────────────────────────────────

const OTA_SUGGESTIONS = ['Airbnb', 'Booking.com', 'MakeMyTrip', 'Goibibo', 'Agoda', 'Expedia']

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? 'Copied!' : 'Copy to clipboard'}
      className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

function AddConnectionDialog({
  roomId,
  onAdded,
}: {
  roomId: string
  onAdded: (conn: ICalConnection) => void
}) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [feedUrl, setFeedUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    setError(null)
    if (!name.trim()) { setError('Name is required'); return }
    if (!feedUrl.trim() || !feedUrl.startsWith('http')) { setError('Valid URL required (starts with http)'); return }

    setLoading(true)
    const { data, error: dbErr } = await supabase
      .from('ical_connections')
      .insert({ room_id: roomId, name: name.trim(), feed_url: feedUrl.trim() })
      .select()
      .single()
    setLoading(false)

    if (dbErr) { setError(dbErr.message); return }
    onAdded(data as ICalConnection)
    setOpen(false)
    setName('')
    setFeedUrl('')
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="w-3.5 h-3.5" />
        Add feed
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add iCal feed</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Source name *</Label>
              <div className="flex gap-1.5 flex-wrap mb-2">
                {OTA_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setName(s)}
                    className={cn(
                      'text-xs px-2 py-1 rounded-full border transition-colors',
                      name === s
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <Input
                placeholder="e.g. Airbnb"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>iCal feed URL *</Label>
              <Input
                placeholder="https://www.airbnb.com/calendar/ical/..."
                value={feedUrl}
                onChange={(e) => setFeedUrl(e.target.value)}
                className="font-mono text-xs"
              />
              <p className="text-xs text-gray-400">
                In Airbnb: Listing → Availability → Export Calendar
              </p>
            </div>
          </div>
          <DialogFooter showCloseButton>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? 'Adding…' : 'Add feed'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ICalRoomSection({
  room,
  appUrl,
}: {
  room: Room
  appUrl: string
}) {
  const supabase = createClient()
  const [connections, setConnections] = useState<ICalConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const icalToken = (room as Room & { ical_export_token?: string }).ical_export_token
  const exportUrl = icalToken ? `${appUrl}/api/ical/${icalToken}` : null

  useEffect(() => {
    supabase
      .from('ical_connections')
      .select('*')
      .eq('room_id', room.id)
      .eq('is_active', true)
      .order('created_at')
      .then(({ data }) => {
        setConnections((data ?? []) as ICalConnection[])
        setLoading(false)
      })
  }, [room.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDelete(connId: string) {
    await supabase.from('ical_connections').update({ is_active: false }).eq('id', connId)
    setConnections((prev) => prev.filter((c) => c.id !== connId))
  }

  async function handleSyncNow() {
    setSyncing(true)
    await fetch('/api/cron/sync-ical')
    // Re-fetch connections to update last_synced_at
    const { data } = await supabase
      .from('ical_connections')
      .select('*')
      .eq('room_id', room.id)
      .eq('is_active', true)
      .order('created_at')
    setConnections((data ?? []) as ICalConnection[])
    setSyncing(false)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-gray-900 text-sm">{room.name}</p>
        <AddConnectionDialog
          roomId={room.id}
          onAdded={(conn) => setConnections((prev) => [...prev, conn])}
        />
      </div>

      {/* Export URL */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Export URL (share with OTAs)</p>
        {exportUrl ? (
          <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
            <Link2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="text-xs font-mono text-gray-600 truncate flex-1">{exportUrl}</span>
            <CopyButton text={exportUrl} />
          </div>
        ) : (
          <p className="text-xs text-gray-400 italic">Token not generated yet — run schema migration first.</p>
        )}
      </div>

      {/* Import feeds */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Import feeds</p>
          {connections.length > 0 && (
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={syncing}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
            >
              <RefreshCw className={cn('w-3 h-3', syncing && 'animate-spin')} />
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : connections.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No feeds added. Add an Airbnb or Booking.com feed above.</p>
        ) : (
          <div className="space-y-2">
            {connections.map((conn) => (
              <div
                key={conn.id}
                className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
              >
                {conn.sync_error ? (
                  <WifiOff className="w-3.5 h-3.5 text-red-500 shrink-0" />
                ) : (
                  <Wifi className="w-3.5 h-3.5 text-green-500 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{conn.name}</p>
                  {conn.sync_error ? (
                    <p className="text-xs text-red-500 truncate">{conn.sync_error}</p>
                  ) : conn.last_synced_at ? (
                    <p className="text-xs text-gray-400">
                      Last synced {new Date(conn.last_synced_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400">Not synced yet</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(conn.id)}
                  className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-red-500 transition-colors"
                  title="Remove feed"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ICalTab({
  rooms,
}: {
  rooms: Room[]
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
        <p className="font-medium mb-1">Two-way calendar sync</p>
        <p className="text-xs text-blue-600">
          <strong>Export:</strong> Share your room&apos;s URL with Airbnb/Booking.com so they block dates automatically.
          <br />
          <strong>Import:</strong> Add OTA calendar URLs so blocked dates appear in grey on your calendar.
        </p>
      </div>

      {rooms.length === 0 ? (
        <p className="text-sm text-gray-500">Add rooms first to set up iCal sync.</p>
      ) : (
        rooms.map((room) => (
          <ICalRoomSection key={room.id} room={room} appUrl={appUrl} />
        ))
      )}
    </div>
  )
}

// ─────────────────────────────────────────
// Details tab (edit property)
// ─────────────────────────────────────────

function DetailsTab({ property }: { property: Property }) {
  const router = useRouter()
  const supabase = createClient()
  const fetchProperties = usePropertyStore((s) => s.fetchProperties)

  const INITIAL: PropertyFormData = {
    name: property.name,
    address_line1: property.address_line1,
    address_line2: property.address_line2 ?? '',
    city: property.city,
    state: property.state,
    pincode: property.pincode,
    phone: property.phone ?? '',
    email: property.email ?? '',
    gstin: property.gstin ?? '',
    default_checkin_time: property.default_checkin_time,
    default_checkout_time: property.default_checkout_time,
    cancellation_policy: property.cancellation_policy ?? '',
  }

  const [form, setForm] = useState<PropertyFormData>(INITIAL)
  const [errors, setErrors] = useState<Partial<Record<keyof PropertyFormData, string>>>({})
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  function set(field: keyof PropertyFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
    setSaved(false)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setServerError(null)
    setSaved(false)

    const result = propertySchema.safeParse(form)
    if (!result.success) {
      const errs: Partial<Record<keyof PropertyFormData, string>> = {}
      result.error.issues.forEach((issue) => {
        const k = issue.path[0] as keyof PropertyFormData
        if (!errs[k]) errs[k] = issue.message
      })
      setErrors(errs)
      return
    }

    setLoading(true)
    const { error } = await supabase
      .from('properties')
      .update({
        name: form.name,
        address_line1: form.address_line1,
        address_line2: form.address_line2 || null,
        city: form.city,
        pincode: form.pincode,
        state: form.state,
        phone: form.phone || null,
        email: form.email || null,
        gstin: form.gstin || null,
        default_checkin_time: form.default_checkin_time,
        default_checkout_time: form.default_checkout_time,
        cancellation_policy: form.cancellation_policy || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', property.id)

    setLoading(false)

    if (error) {
      if (error.code === '23505') {
        setErrors((prev) => ({ ...prev, name: 'A property with this name already exists' }))
      } else {
        setServerError(error.message)
      }
      return
    }

    await fetchProperties(supabase)
    setSaved(true)
    router.refresh()
  }

  async function handleDelete() {
    const { error } = await supabase
      .from('properties')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', property.id)

    if (error) { setServerError(error.message); return }

    await fetchProperties(supabase)
    router.push('/properties')
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {serverError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {serverError}
        </div>
      )}

      {/* Basic info */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-medium text-gray-900">Basic info</h2>

        <div className="space-y-1.5">
          <Label htmlFor="e-name">Property name *</Label>
          <Input
            id="e-name"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            aria-invalid={!!errors.name}
          />
          <FieldError msg={errors.name} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="e-phone">Phone number</Label>
            <div className="flex">
              <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 text-sm text-gray-500 select-none">
                +91
              </span>
              <Input
                id="e-phone"
                type="tel"
                inputMode="numeric"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="rounded-l-none"
                aria-invalid={!!errors.phone}
              />
            </div>
            <FieldError msg={errors.phone} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="e-email">Email</Label>
            <Input
              id="e-email"
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              aria-invalid={!!errors.email}
            />
            <FieldError msg={errors.email} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="e-gstin">GSTIN (optional)</Label>
          <Input
            id="e-gstin"
            value={form.gstin}
            onChange={(e) => set('gstin', e.target.value.toUpperCase().slice(0, 15))}
            className="font-mono tracking-wide"
            aria-invalid={!!errors.gstin}
          />
          <FieldError msg={errors.gstin} />
        </div>
      </section>

      {/* Address */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-medium text-gray-900">Address</h2>

        <div className="space-y-1.5">
          <Label htmlFor="e-line1">Address line 1 *</Label>
          <Input
            id="e-line1"
            value={form.address_line1}
            onChange={(e) => set('address_line1', e.target.value)}
            aria-invalid={!!errors.address_line1}
          />
          <FieldError msg={errors.address_line1} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="e-line2">Address line 2</Label>
          <Input
            id="e-line2"
            value={form.address_line2}
            onChange={(e) => set('address_line2', e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="e-city">City *</Label>
            <Input
              id="e-city"
              value={form.city}
              onChange={(e) => set('city', e.target.value)}
              aria-invalid={!!errors.city}
            />
            <FieldError msg={errors.city} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-pincode">Pincode *</Label>
            <Input
              id="e-pincode"
              type="text"
              inputMode="numeric"
              value={form.pincode}
              onChange={(e) => set('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))}
              aria-invalid={!!errors.pincode}
            />
            <FieldError msg={errors.pincode} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="e-state">State *</Label>
          <Select value={form.state} onValueChange={(v) => set('state', v ?? '')}>
            <SelectTrigger id="e-state" className="w-full" aria-invalid={!!errors.state}>
              <SelectValue placeholder="Select state" />
            </SelectTrigger>
            <SelectContent>
              {INDIAN_STATES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError msg={errors.state} />
        </div>
      </section>

      {/* Check-in / out */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-medium text-gray-900">Check-in &amp; check-out</h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="e-ci">Default check-in time</Label>
            <TimeSelect
              id="e-ci"
              value={form.default_checkin_time}
              onChange={(v) => set('default_checkin_time', v)}
            />
            <FieldError msg={errors.default_checkin_time} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="e-co">Default check-out time</Label>
            <TimeSelect
              id="e-co"
              value={form.default_checkout_time}
              onChange={(v) => set('default_checkout_time', v)}
            />
            <FieldError msg={errors.default_checkout_time} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="e-policy">Cancellation policy</Label>
          <Textarea
            id="e-policy"
            value={form.cancellation_policy}
            onChange={(e) => set('cancellation_policy', e.target.value)}
            rows={3}
          />
        </div>
      </section>

      {/* Actions */}
      <div className="flex items-center justify-between pb-8">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete property
        </Button>

        <div className="flex items-center gap-3">
          {saved && <p className="text-sm text-green-600 font-medium">Saved!</p>}
          <Button type="submit" disabled={loading}>
            {loading ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete property?"
        description={`"${property.name}" and all its rooms will be permanently removed. Existing bookings may be affected.`}
        onConfirm={handleDelete}
      />
    </form>
  )
}

// ─────────────────────────────────────────
// Main export
// ─────────────────────────────────────────

export function PropertyDetail({
  property,
  initialRooms,
  initialTab,
}: {
  property: Property
  initialRooms: Room[]
  initialTab: 'details' | 'rooms' | 'ical'
}) {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Back */}
      <Link
        href="/properties"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="w-4 h-4" />
        Properties
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{property.name}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {[property.city, property.state].filter(Boolean).join(', ')}
          {property.gstin && (
            <span className="ml-2 font-mono text-xs text-gray-400">{property.gstin}</span>
          )}
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="rooms">
            Rooms
            {initialRooms.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-4 min-w-4 text-xs">
                {initialRooms.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="ical">iCal Sync</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-6">
          <DetailsTab property={property} />
        </TabsContent>

        <TabsContent value="rooms" className="mt-6">
          <RoomsTab propertyId={property.id} initialRooms={initialRooms} />
        </TabsContent>

        <TabsContent value="ical" className="mt-6">
          <ICalTab rooms={initialRooms} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
