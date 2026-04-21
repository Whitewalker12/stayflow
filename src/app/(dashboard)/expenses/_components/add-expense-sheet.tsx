'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { rupeesToPaise } from '@/lib/utils/currency'
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from '@/types'
import type { ExpenseCategory } from '@/types'

interface AddExpenseSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  propertyId: string
  onCreated: () => void
}

function todayStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
}

export function AddExpenseSheet({
  open,
  onOpenChange,
  propertyId,
  onCreated,
}: AddExpenseSheetProps) {
  const supabase = createClient()

  const [category, setCategory] = useState<ExpenseCategory>('utilities')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayStr())
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setCategory('utilities')
    setAmount('')
    setDate(todayStr())
    setDescription('')
    setError(null)
  }

  function handleOpenChange(val: boolean) {
    if (!val) reset()
    onOpenChange(val)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const amountNum = parseFloat(amount)
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      setError('Enter a valid amount')
      return
    }
    if (!date) {
      setError('Pick a date')
      return
    }

    setSubmitting(true)

    const { error: dbErr } = await supabase.from('expenses').insert({
      property_id: propertyId,
      category,
      amount_paise: rupeesToPaise(amountNum),
      expense_date: date,
      description: description.trim() || null,
    })

    setSubmitting(false)

    if (dbErr) {
      setError(dbErr.message)
      return
    }

    toast.success('Expense added')
    reset()
    onCreated()
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0 gap-0">
        <SheetHeader className="px-6 py-5 border-b border-gray-100 shrink-0">
          <SheetTitle className="text-base">Add Expense</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <form id="add-expense-form" onSubmit={handleSubmit}>
            <div className="px-6 py-5 space-y-4">

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              {/* Category */}
              <div className="space-y-1.5">
                <Label>Category <span className="text-red-500">*</span></Label>
                <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {EXPENSE_CATEGORY_LABELS[cat]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Amount */}
              <div className="space-y-1.5">
                <Label>Amount (₹) <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  min={1}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 1500"
                />
              </div>

              {/* Date */}
              <div className="space-y-1.5">
                <Label>Date <span className="text-red-500">*</span></Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label>Description <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Electricity bill for April, Plumber visit..."
                  rows={3}
                />
              </div>

            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-white shrink-0 flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="add-expense-form"
            className="flex-1"
            disabled={submitting}
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</>
            ) : (
              'Add Expense'
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
