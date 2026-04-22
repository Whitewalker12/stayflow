'use client'

/**
 * Renders two buttons: Export CSV (instant) and Export PDF (via @react-pdf/renderer).
 * PDF renderer is dynamically imported to avoid SSR.
 */

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Download, FileText, Loader2 } from 'lucide-react'
import type { ReportPDFProps } from './report-pdf'

// ── CSV helper ────────────────────────────────────────────────────────────────

function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
  const lines = [
    headers.map(escape).join(','),
    ...rows.map((r) => r.map(escape).join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ReportDownloadButtonProps {
  csvFilename: string
  csvHeaders: string[]
  csvRows: string[][]
  pdf: ReportPDFProps
  pdfFilename: string
  disabled?: boolean
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ReportDownloadButtons({
  csvFilename,
  csvHeaders,
  csvRows,
  pdf,
  pdfFilename,
  disabled,
}: ReportDownloadButtonProps) {
  const [PDFComponents, setPDFComponents] = useState<{
    PDFDownloadLink: (typeof import('@react-pdf/renderer'))['PDFDownloadLink']
    ReportPDF: (typeof import('./report-pdf'))['ReportPDF']
  } | null>(null)

  useEffect(() => {
    Promise.all([
      import('@react-pdf/renderer'),
      import('./report-pdf'),
    ]).then(([renderer, pdfMod]) => {
      setPDFComponents({
        PDFDownloadLink: renderer.PDFDownloadLink,
        ReportPDF: pdfMod.ReportPDF,
      })
    })
  }, [])

  return (
    <div className="flex items-center gap-2">
      {/* CSV */}
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5"
        disabled={disabled || csvRows.length === 0}
        onClick={() => downloadCSV(csvFilename, csvHeaders, csvRows)}
      >
        <Download className="w-3.5 h-3.5" />
        CSV
      </Button>

      {/* PDF */}
      {!PDFComponents ? (
        <Button size="sm" variant="outline" disabled>
          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
          PDF
        </Button>
      ) : (
        <PDFComponents.PDFDownloadLink
          document={<PDFComponents.ReportPDF {...pdf} />}
          fileName={pdfFilename}
        >
          {({ loading }) =>
            loading ? (
              <Button size="sm" variant="outline" disabled>
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                PDF
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={disabled || csvRows.length === 0}
              >
                <FileText className="w-3.5 h-3.5" />
                PDF
              </Button>
            )
          }
        </PDFComponents.PDFDownloadLink>
      )}
    </div>
  )
}
