/**
 * Invoice PDF component — uses @react-pdf/renderer primitives only.
 *
 * IMPORTANT: This file MUST NOT be imported directly in server or client components.
 * Always import via the dynamic InvoiceDownloadButton which handles ssr:false.
 *
 * Uses only: Document, Page, View, Text, StyleSheet from @react-pdf/renderer.
 * No Tailwind, no HTML elements, no browser APIs.
 */

import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from '@react-pdf/renderer'
import { paiseToWords } from '@/lib/utils/number-to-words'
import type { Invoice } from '@/types'

// ── Indian number formatter (Intl unavailable in PDF renderer runtime) ─────
function fmtRupees(paise: number): string {
  const rupees = Math.floor(paise / 100)
  if (rupees === 0) return '0'
  const s = rupees.toString()
  if (s.length <= 3) return s
  const last3 = s.slice(-3)
  const rest = s.slice(0, -3)
  // Indian comma: every 2 digits before the last 3
  const formatted = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')
  return `${formatted},${last3}`
}

function rupeeStr(paise: number): string {
  return `\u20B9${fmtRupees(paise)}`   // ₹ U+20B9
}

// ── Styles ──────────────────────────────────────────────────────────────────
const c = {
  navy:   '#1e3a5f',
  gray7:  '#374151',
  gray5:  '#6b7280',
  gray4:  '#9ca3af',
  gray2:  '#e5e7eb',
  gray1:  '#f9fafb',
  blue6:  '#2563eb',
  white:  '#ffffff',
  green:  '#16a34a',
}

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    paddingTop: 36,
    paddingBottom: 60,
    paddingHorizontal: 40,
    color: c.gray7,
    backgroundColor: c.white,
  },

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  propertyBlock: { flex: 1, paddingRight: 20 },
  propertyName: {
    fontSize: 15,
    fontFamily: 'Helvetica-Bold',
    color: c.navy,
    marginBottom: 3,
  },
  propertyMeta: { fontSize: 9, color: c.gray5, lineHeight: 1.6 },
  taxInvoiceBlock: { alignItems: 'flex-end' },
  taxInvoiceTitle: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: c.blue6,
    letterSpacing: 1,
  },
  taxInvoiceSubtitle: { fontSize: 9, color: c.gray5, marginTop: 2 },

  // ── Divider ──────────────────────────────────────────────────────────────
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: c.gray2,
    marginBottom: 14,
    marginTop: 2,
  },

  // ── Meta grid ────────────────────────────────────────────────────────────
  metaGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  metaCell: { flex: 1 },
  metaLabel: {
    fontSize: 8,
    color: c.gray4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  metaValue: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: c.gray7 },

  // ── Bill to / From ────────────────────────────────────────────────────────
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    backgroundColor: c.gray1,
    borderRadius: 4,
    padding: 12,
  },
  billBlock: { flex: 1, paddingRight: 10 },
  billLabel: {
    fontSize: 8,
    color: c.gray4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  billName: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: c.gray7,
    marginBottom: 3,
  },
  billDetail: { fontSize: 9, color: c.gray5, lineHeight: 1.5 },

  // ── Table ─────────────────────────────────────────────────────────────────
  tableContainer: { marginBottom: 20 },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: c.navy,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 3,
    marginBottom: 1,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: c.gray2,
  },
  tableRowAlt: { backgroundColor: c.gray1 },

  // Column widths
  colSno:    { width: '6%' },
  colDesc:   { width: '38%' },
  colSac:    { width: '12%', textAlign: 'center' },
  colNights: { width: '11%', textAlign: 'center' },
  colRate:   { width: '16%', textAlign: 'right' },
  colAmt:    { width: '17%', textAlign: 'right' },

  thText: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: c.white },
  tdText: { fontSize: 9, color: c.gray7 },
  tdTextBold: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: c.gray7 },

  // ── Totals ────────────────────────────────────────────────────────────────
  totalsWrapper: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 12,
  },
  totalsBox: { width: 260 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  totalRowBorder: {
    borderTopWidth: 1,
    borderTopColor: c.gray2,
    marginTop: 2,
    paddingTop: 5,
  },
  totalLabel: { fontSize: 9, color: c.gray5 },
  totalValue: { fontSize: 9, textAlign: 'right', color: c.gray7 },
  grandTotalBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: c.navy,
    borderRadius: 3,
    paddingVertical: 7,
    paddingHorizontal: 6,
    marginTop: 4,
  },
  grandTotalLabel: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: c.white },
  grandTotalValue: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: c.white,
    textAlign: 'right',
  },

  // ── Amount in words ───────────────────────────────────────────────────────
  wordsBox: {
    borderWidth: 1,
    borderColor: c.gray2,
    borderRadius: 4,
    padding: 8,
    marginBottom: 16,
    backgroundColor: c.gray1,
  },
  wordsLabel: {
    fontSize: 8,
    color: c.gray4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  wordsText: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: c.gray7 },

  // ── Notes ─────────────────────────────────────────────────────────────────
  notesBox: { marginBottom: 16 },
  notesLabel: {
    fontSize: 8,
    color: c.gray4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  notesText: { fontSize: 9, color: c.gray5, lineHeight: 1.5 },

  // ── Footer (fixed) ────────────────────────────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
  },
  footerDivider: {
    borderTopWidth: 1,
    borderTopColor: c.gray2,
    marginBottom: 8,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  footerLeft: { flex: 1 },
  footerText: { fontSize: 8, color: c.gray4, lineHeight: 1.5 },
  signatureBlock: { alignItems: 'center' },
  signatureLine: {
    borderTopWidth: 1,
    borderTopColor: c.gray7,
    width: 100,
    marginBottom: 3,
    marginTop: 20,
  },
  signatureLabel: { fontSize: 8, color: c.gray5 },
})

// ── Component ──────────────────────────────────────────────────────────────
interface InvoicePDFProps {
  invoice: Invoice
}

export function InvoicePDF({ invoice }: InvoicePDFProps) {
  const lineData = invoice.line_items

  const isInterState = invoice.igst_rate > 0
  const gstPercent = isInterState
    ? invoice.igst_rate
    : invoice.cgst_rate + invoice.sgst_rate

  const amountWords = paiseToWords(invoice.total_paise)

  return (
    <Document
      title={invoice.invoice_number}
      author={invoice.property_name}
      creator="StayFlow PMS"
    >
      <Page size="A4" style={styles.page}>

        {/* ── Header ──────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.propertyBlock}>
            <Text style={styles.propertyName}>{invoice.property_name}</Text>
            <Text style={styles.propertyMeta}>{invoice.property_address}</Text>
            {invoice.property_gstin ? (
              <Text style={styles.propertyMeta}>
                GSTIN: {invoice.property_gstin}
              </Text>
            ) : null}
          </View>
          <View style={styles.taxInvoiceBlock}>
            <Text style={styles.taxInvoiceTitle}>TAX INVOICE</Text>
            <Text style={styles.taxInvoiceSubtitle}>
              SAC Code: 9963 (Accommodation)
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* ── Meta row ────────────────────────────────────────────── */}
        <View style={styles.metaGrid}>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Invoice Number</Text>
            <Text style={styles.metaValue}>{invoice.invoice_number}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Invoice Date</Text>
            <Text style={styles.metaValue}>{invoice.invoice_date}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Place of Supply</Text>
            <Text style={styles.metaValue}>
              {lineData?.property_state ?? '—'}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>GST Rate</Text>
            <Text style={styles.metaValue}>{gstPercent}%</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Supply Type</Text>
            <Text style={styles.metaValue}>
              {isInterState ? 'Inter-State' : 'Intra-State'}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* ── Bill To / Billed By ──────────────────────────────────── */}
        <View style={styles.billRow}>
          <View style={styles.billBlock}>
            <Text style={styles.billLabel}>Bill To</Text>
            <Text style={styles.billName}>{invoice.guest_name}</Text>
            {invoice.guest_address ? (
              <Text style={styles.billDetail}>{invoice.guest_address}</Text>
            ) : null}
            {lineData?.guest_state ? (
              <Text style={styles.billDetail}>{lineData.guest_state}</Text>
            ) : null}
            {invoice.guest_gstin ? (
              <Text style={styles.billDetail}>GSTIN: {invoice.guest_gstin}</Text>
            ) : null}
          </View>

          <View style={[styles.billBlock, { borderLeftWidth: 1, borderLeftColor: c.gray2, paddingLeft: 10, paddingRight: 0 }]}>
            <Text style={styles.billLabel}>Billed By</Text>
            <Text style={styles.billName}>{invoice.property_name}</Text>
            <Text style={styles.billDetail}>{invoice.property_address}</Text>
            {invoice.property_gstin ? (
              <Text style={styles.billDetail}>GSTIN: {invoice.property_gstin}</Text>
            ) : null}
          </View>
        </View>

        {/* ── Line Items Table ─────────────────────────────────────── */}
        <View style={styles.tableContainer}>
          {/* Header */}
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.thText, styles.colSno]}>#</Text>
            <Text style={[styles.thText, styles.colDesc]}>Description</Text>
            <Text style={[styles.thText, styles.colSac]}>SAC</Text>
            <Text style={[styles.thText, styles.colNights]}>Nights</Text>
            <Text style={[styles.thText, styles.colRate]}>Rate (₹)</Text>
            <Text style={[styles.thText, styles.colAmt]}>Amount (₹)</Text>
          </View>

          {/* Rows */}
          {lineData?.items.map((item, i) => (
            <View
              key={i}
              style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}
            >
              <Text style={[styles.tdText, styles.colSno]}>{i + 1}</Text>
              <Text style={[styles.tdTextBold, styles.colDesc]}>
                {item.description}
              </Text>
              <Text style={[styles.tdText, styles.colSac]}>{item.sac_code}</Text>
              <Text style={[styles.tdText, styles.colNights]}>{item.qty}</Text>
              <Text style={[styles.tdText, styles.colRate]}>
                {rupeeStr(item.rate_paise)}
              </Text>
              <Text style={[styles.tdText, styles.colAmt]}>
                {rupeeStr(item.amount_paise)}
              </Text>
            </View>
          )) ?? (
            <View style={styles.tableRow}>
              <Text style={[styles.tdText, { flex: 1 }]}>
                Accommodation — {invoice.invoice_number}
              </Text>
              <Text style={[styles.tdText, styles.colAmt]}>
                {rupeeStr(invoice.subtotal_paise)}
              </Text>
            </View>
          )}
        </View>

        {/* ── Totals ──────────────────────────────────────────────── */}
        <View style={styles.totalsWrapper}>
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>{rupeeStr(invoice.subtotal_paise)}</Text>
            </View>

            {isInterState ? (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>
                  IGST @ {invoice.igst_rate}%
                </Text>
                <Text style={styles.totalValue}>
                  {rupeeStr(invoice.igst_amount_paise)}
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>
                    CGST @ {invoice.cgst_rate}%
                  </Text>
                  <Text style={styles.totalValue}>
                    {rupeeStr(invoice.cgst_amount_paise)}
                  </Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>
                    SGST @ {invoice.sgst_rate}%
                  </Text>
                  <Text style={styles.totalValue}>
                    {rupeeStr(invoice.sgst_amount_paise)}
                  </Text>
                </View>
              </>
            )}

            <View style={[styles.totalRow, styles.totalRowBorder]}>
              <Text style={styles.totalLabel}>Total Tax</Text>
              <Text style={styles.totalValue}>
                {rupeeStr(
                  invoice.cgst_amount_paise +
                  invoice.sgst_amount_paise +
                  invoice.igst_amount_paise
                )}
              </Text>
            </View>

            <View style={styles.grandTotalBox}>
              <Text style={styles.grandTotalLabel}>Grand Total</Text>
              <Text style={styles.grandTotalValue}>
                {rupeeStr(invoice.total_paise)}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Amount in Words ──────────────────────────────────────── */}
        <View style={styles.wordsBox}>
          <Text style={styles.wordsLabel}>Amount in Words</Text>
          <Text style={styles.wordsText}>{amountWords}</Text>
        </View>

        {/* ── Notes ────────────────────────────────────────────────── */}
        {invoice.notes ? (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.notesText}>{invoice.notes}</Text>
          </View>
        ) : null}

        {/* ── Footer (fixed at bottom of every page) ───────────────── */}
        <View style={styles.footer} fixed>
          <View style={styles.footerDivider} />
          <View style={styles.footerRow}>
            <View style={styles.footerLeft}>
              <Text style={styles.footerText}>
                This is a computer-generated tax invoice.
              </Text>
              <Text style={styles.footerText}>
                {invoice.property_name} · {invoice.property_address}
              </Text>
            </View>
            <View style={styles.signatureBlock}>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>Authorised Signatory</Text>
            </View>
          </View>
        </View>

      </Page>
    </Document>
  )
}
