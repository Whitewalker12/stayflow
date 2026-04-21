'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePropertyStore } from '@/stores/property-store'
import { format, parseISO } from 'date-fns'
import { Plus, Building2, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, paiseToRupees } from '@/lib/utils/currency'
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
} from '@/types'
import type { Expense, ExpenseCategory } from '@/types'
import { AddExpenseSheet } from './add-expense-sheet'
import Link from 'next/link'

// ── Category colours ──────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  cleaning:       'bg-blue-50 text-blue-700 border-blue-200',
  maintenance:    'bg-orange-50 text-orange-700 border-orange-200',
  utilities:      'bg-yellow-50 text-yellow-700 border-yellow-200',
  supplies:       'bg-green-50 text-green-700 border-green-200',
  staff:          'bg-purple-50 text-purple-700 border-purple-200',
  ota_commission: 'bg-pink-50 text-pink-700 border-pink-200',
  other:          'bg-gray-50 text-gray-600 border-gray-200',
}

// ── Month helpers ─────────────────────────────────────────────────────────────

function currentYearMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function monthOptions() {
  const opts: { value: string; label: string }[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = format(d, 'MMMM yyyy')
    opts.push({ value, label })
  }
  return opts
}

// ── Main component ────────────────────────────────────────────────────────────

export function ExpensesClient() {
  const supabase = createClient()
  const { properties, activePropertyId, setActiveProperty, fetchProperties } = usePropertyStore()

  useEffect(() => { fetchProperties(supabase) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(false)
  const [month, setMonth] = useState(currentYearMonth())
  const [categoryFilter, setCategoryFilter] = useState<'all' | ExpenseCategory>('all')
  const [sheetOpen, setSheetOpen] = useState(false)

  const months = monthOptions()

  const fetchExpenses = useCallback(async () => {
    if (!activePropertyId) { setExpenses([]); return }
    setLoading(true)

    const [year, mon] = month.split('-').map(Number)
    const lastDay = new Date(year, mon, 0).getDate()
    const start = `${month}-01`
    const end = `${month}-${String(lastDay).padStart(2, '0')}`

    let query = supabase
      .from('expenses')
      .select('*')
      .eq('property_id', activePropertyId)
      .gte('expense_date', start)
      .lte('expense_date', end)
      .order('expense_date', { ascending: false })

    if (categoryFilter !== 'all') {
      query = query.eq('category', categoryFilter)
    }

    const { data } = await query
    setExpenses((data ?? []) as Expense[])
    setLoading(false)
  }, [activePropertyId, month, categoryFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchExpenses() }, [fetchExpenses])

  // ── Totals ────────────────────────────────────────────────────────────────

  const totalPaise = expenses.reduce((s, e) => s + e.amount_paise, 0)

  const byCategory = EXPENSE_CATEGORIES.reduce<Record<string, number>>((acc, cat) => {
    acc[cat] = expenses
      .filter((e) => e.category === cat)
      .reduce((s, e) => s + e.amount_paise, 0)
    return acc
  }, {})

  const activeProperty = properties.find((p) => p.id === activePropertyId)

  // ── No property ───────────────────────────────────────────────────────────

  if (!activePropertyId && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <Building2 className="w-7 h-7 text-gray-400" />
        </div>
        <p className="text-gray-900 font-medium mb-1">No property selected</p>
        <p className="text-sm text-gray-500 mb-6 max-w-xs">
          Add a property to start tracking expenses.
        </p>
        <Link href="/properties/new">
          <Button><Plus className="w-4 h-4" /> Add property</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Expenses</h1>
          {activeProperty && (
            <p className="text-sm text-gray-500 mt-0.5">{activeProperty.name}</p>
          )}
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setSheetOpen(true)}
          disabled={!activePropertyId}
        >
          <Plus className="w-4 h-4" />
          Add Expense
        </Button>
      </div>

      {/* ── Filters ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Property switcher */}
        {properties.length > 1 && (
          <Select value={activePropertyId ?? ''} onValueChange={setActiveProperty}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Select property" />
            </SelectTrigger>
            <SelectContent>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Month */}
        <Select value={month} onValueChange={(v) => { if (v) setMonth(v) }}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Category */}
        <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as typeof categoryFilter)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {EXPENSE_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>{EXPENSE_CATEGORY_LABELS[cat]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Summary strip ─────────────────────────────────────────────────────── */}
      {!loading && expenses.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-700">
              {months.find((m) => m.value === month)?.label} · {expenses.length} expense{expenses.length !== 1 ? 's' : ''}
            </p>
            <p className="text-lg font-bold text-gray-900">{formatCurrency(totalPaise)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {EXPENSE_CATEGORIES.filter((cat) => byCategory[cat] > 0).map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(categoryFilter === cat ? 'all' : cat)}
                className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-opacity ${CATEGORY_COLORS[cat]} ${categoryFilter !== 'all' && categoryFilter !== cat ? 'opacity-40' : ''}`}
              >
                {EXPENSE_CATEGORY_LABELS[cat]} · ₹{paiseToRupees(byCategory[cat]).toLocaleString('en-IN')}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── List ──────────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : expenses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-xl border border-gray-200">
          <Receipt className="w-10 h-10 text-gray-200 mb-3" />
          <p className="text-gray-500 font-medium">No expenses found</p>
          <p className="text-sm text-gray-400 mt-1">
            {categoryFilter !== 'all' ? 'Try clearing the category filter.' : 'Add your first expense for this month.'}
          </p>
          {categoryFilter === 'all' && (
            <Button size="sm" className="mt-4 gap-1.5" onClick={() => setSheetOpen(true)}>
              <Plus className="w-4 h-4" /> Add Expense
            </Button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
          {expenses.map((exp) => (
            <div key={exp.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 text-base">
                  {CATEGORY_EMOJI[exp.category]}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">
                    {exp.description || EXPENSE_CATEGORY_LABELS[exp.category]}
                  </p>
                  <p className="text-xs text-gray-400">
                    {format(parseISO(exp.expense_date), 'd MMM yyyy')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className={`text-xs ${CATEGORY_COLORS[exp.category]}`}>
                  {EXPENSE_CATEGORY_LABELS[exp.category]}
                </Badge>
                <p className="font-semibold text-gray-900 text-sm">
                  {formatCurrency(exp.amount_paise)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Sheet ───────────────────────────────────────────────────────────── */}
      {activePropertyId && (
        <AddExpenseSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          propertyId={activePropertyId}
          onCreated={fetchExpenses}
        />
      )}
    </div>
  )
}

const CATEGORY_EMOJI: Record<ExpenseCategory, string> = {
  cleaning:       '🧹',
  maintenance:    '🔧',
  utilities:      '💡',
  supplies:       '📦',
  staff:          '👷',
  ota_commission: '💸',
  other:          '📝',
}
