'use client'

/**
 * PDF Download Button — dynamically imports @react-pdf/renderer
 * so it never runs during SSR (PDF renderer requires browser APIs).
 *
 * Usage:
 *   <InvoiceDownloadButton invoice={invoice} />
 */

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Download, Loader2 } from 'lucide-react'
import type { Invoice } from '@/types'

interface InvoiceDownloadButtonProps {
  invoice: Invoice
  size?: 'sm' | 'default'
  variant?: 'outline' | 'default'
}

export function InvoiceDownloadButton({
  invoice,
  size = 'sm',
  variant = 'outline',
}: InvoiceDownloadButtonProps) {
  // We lazily load the renderer only in the browser
  const [PDFComponents, setPDFComponents] = useState<{
    PDFDownloadLink: (typeof import('@react-pdf/renderer'))['PDFDownloadLink']
    InvoicePDF: (typeof import('./invoice-pdf'))['InvoicePDF']
  } | null>(null)

  useEffect(() => {
    // Dynamic import after mount — never runs on server
    Promise.all([
      import('@react-pdf/renderer'),
      import('./invoice-pdf'),
    ]).then(([renderer, pdfModule]) => {
      setPDFComponents({
        PDFDownloadLink: renderer.PDFDownloadLink,
        InvoicePDF: pdfModule.InvoicePDF,
      })
    })
  }, [])

  if (!PDFComponents) {
    return (
      <Button size={size} variant={variant} disabled>
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Loading PDF…
      </Button>
    )
  }

  const { PDFDownloadLink, InvoicePDF } = PDFComponents
  const fileName = `${invoice.invoice_number}.pdf`

  return (
    <PDFDownloadLink
      document={<InvoicePDF invoice={invoice} />}
      fileName={fileName}
    >
      {({ loading }) =>
        loading ? (
          <Button size={size} variant={variant} disabled>
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Generating…
          </Button>
        ) : (
          <Button size={size} variant={variant} className="gap-1.5">
            <Download className="w-4 h-4" />
            Download PDF
          </Button>
        )
      }
    </PDFDownloadLink>
  )
}
