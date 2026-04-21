import type { Metadata } from 'next'
import { ExpensesClient } from './_components/expenses-client'

export const metadata: Metadata = {
  title: 'Expenses',
  robots: { index: false, follow: false },
}

export default function ExpensesPage() {
  return <ExpensesClient />
}
