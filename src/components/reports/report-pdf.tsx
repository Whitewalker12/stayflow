/**
 * Generic tabular report PDF — used for all 4 report types.
 *
 * IMPORTANT: Never import this directly in server/client components.
 * Always load via dynamic import (see report-download-button.tsx).
 *
 * Uses @react-pdf/renderer primitives only. No HTML, no Tailwind, no Intl.
 */

import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRupees(paise: number): string {
  const rupees = Math.round(paise / 100)
  const s = rupees.toString()
  if (s.length <= 3) return s
  const last3 = s.slice(-3)
  const rest = s.slice(0, -3)
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}`
}

export function rupeeStr(paise: number): string {
  return `\u20B9${fmtRupees(paise)}`
}

// ── Colours ───────────────────────────────────────────────────────────────────

const c = {
  navy:  '#1e3a5f',
  gray7: '#374151',
  gray5: '#6b7280',
  gray2: '#e5e7eb',
  gray1: '#f9fafb',
  white: '#ffffff',
  green: '#16a34a',
  red:   '#dc2626',
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    paddingTop: 32,
    paddingBottom: 48,
    paddingHorizontal: 36,
    color: c.gray7,
    backgroundColor: c.white,
  },
  // Header
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  brandName: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: c.navy },
  reportTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: c.gray7, marginTop: 3 },
  reportMeta: { fontSize: 8, color: c.gray5, marginTop: 2 },
  divider: { height: 1, backgroundColor: c.gray2, marginBottom: 14 },
  // Summary strip
  summaryRow: { flexDirection: 'row', gap: 16, marginBottom: 14 },
  summaryBox: { flex: 1, backgroundColor: c.gray1, borderRadius: 4, padding: 8 },
  summaryLabel: { fontSize: 7, color: c.gray5, textTransform: 'uppercase', marginBottom: 3 },
  summaryValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: c.navy },
  // Table
  tableHeader: { flexDirection: 'row', backgroundColor: c.navy, paddingVertical: 5, paddingHorizontal: 4, borderRadius: 2 },
  tableHeaderCell: { color: c.white, fontFamily: 'Helvetica-Bold', fontSize: 8 },
  tableRow: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: c.gray2 },
  tableRowAlt: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 4, backgroundColor: c.gray1, borderBottomWidth: 1, borderBottomColor: c.gray2 },
  tableCell: { fontSize: 8, color: c.gray7 },
  tableTotalRow: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 4, backgroundColor: c.gray2, borderTopWidth: 1, borderTopColor: c.navy, marginTop: 2 },
  tableTotalCell: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: c.navy },
  // Footer
  footer: { position: 'absolute', bottom: 24, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 7, color: c.gray5 },
})

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReportColumn = { header: string; width: number; align?: 'left' | 'right' }

export type ReportSummary = { label: string; value: string }

export interface ReportPDFProps {
  title: string
  propertyName: string
  dateRange: string
  columns: ReportColumn[]
  rows: string[][]
  totalRow?: string[]
  summaries?: ReportSummary[]
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ReportPDF({
  title,
  propertyName,
  dateRange,
  columns,
  rows,
  totalRow,
  summaries,
}: ReportPDFProps) {
  const generatedAt = new Date().toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>

        {/* Header */}
        <View style={s.headerRow}>
          <View>
            <Text style={s.brandName}>HomeStayPMS</Text>
            <Text style={s.reportTitle}>{title}</Text>
            <Text style={s.reportMeta}>{propertyName} · {dateRange}</Text>
          </View>
          <View>
            <Text style={s.reportMeta}>Generated: {generatedAt}</Text>
          </View>
        </View>

        <View style={s.divider} />

        {/* Summary strip */}
        {summaries && summaries.length > 0 && (
          <View style={s.summaryRow}>
            {summaries.map((sum, i) => (
              <View key={i} style={s.summaryBox}>
                <Text style={s.summaryLabel}>{sum.label}</Text>
                <Text style={s.summaryValue}>{sum.value}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Table header */}
        <View style={s.tableHeader}>
          {columns.map((col, i) => (
            <Text
              key={i}
              style={[s.tableHeaderCell, {
                width: col.width,
                textAlign: col.align === 'right' ? 'right' : 'left',
              }]}
            >
              {col.header}
            </Text>
          ))}
        </View>

        {/* Rows */}
        {rows.map((row, ri) => (
          <View key={ri} style={ri % 2 === 0 ? s.tableRow : s.tableRowAlt} wrap={false}>
            {columns.map((col, ci) => (
              <Text
                key={ci}
                style={[s.tableCell, {
                  width: col.width,
                  textAlign: col.align === 'right' ? 'right' : 'left',
                }]}
              >
                {row[ci] ?? ''}
              </Text>
            ))}
          </View>
        ))}

        {/* Total row */}
        {totalRow && (
          <View style={s.tableTotalRow}>
            {columns.map((col, ci) => (
              <Text
                key={ci}
                style={[s.tableTotalCell, {
                  width: col.width,
                  textAlign: col.align === 'right' ? 'right' : 'left',
                }]}
              >
                {totalRow[ci] ?? ''}
              </Text>
            ))}
          </View>
        )}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>HomeStayPMS · Confidential</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}`
          } />
        </View>

      </Page>
    </Document>
  )
}
