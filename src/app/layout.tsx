import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const geist = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://homestaypms.com'
const APP_NAME = 'HomeStayPMS'
const DEFAULT_DESCRIPTION =
  'HomeStayPMS — Property management software built for Indian homestay owners. Manage bookings, guests, invoices, and WhatsApp notifications from one place.'

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),

  // ── Title template ──────────────────────────────────────────────────────
  title: {
    default: `${APP_NAME} — Homestay Property Management`,
    template: `%s | ${APP_NAME}`,
  },

  // ── Description ─────────────────────────────────────────────────────────
  description: DEFAULT_DESCRIPTION,
  keywords: [
    'homestay management software',
    'property management system India',
    'PMS India',
    'homestay PMS',
    'guest house management',
    'bed and breakfast software',
    'Airbnb management India',
    'booking management software',
    'GST invoicing hotel',
    'WhatsApp hotel management',
    'small hotel software India',
  ],

  // ── Authors & canonical ──────────────────────────────────────────────────
  authors: [{ name: APP_NAME, url: APP_URL }],
  creator: APP_NAME,
  publisher: APP_NAME,

  // ── Open Graph ───────────────────────────────────────────────────────────
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: APP_URL,
    siteName: APP_NAME,
    title: `${APP_NAME} — Homestay Property Management for India`,
    description: DEFAULT_DESCRIPTION,
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'HomeStayPMS — Manage bookings, guests and invoices from your phone',
      },
    ],
  },

  // ── Twitter / X ──────────────────────────────────────────────────────────
  twitter: {
    card: 'summary_large_image',
    title: `${APP_NAME} — Homestay Property Management`,
    description: DEFAULT_DESCRIPTION,
    images: ['/og-image.png'],
    creator: '@homestaypms',
  },

  // ── Icons ────────────────────────────────────────────────────────────────
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
    shortcut: '/favicon.ico',
  },

  // ── Manifest ─────────────────────────────────────────────────────────────
  manifest: '/site.webmanifest',

  // ── Robots ───────────────────────────────────────────────────────────────
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },

  // ── Alternate languages ──────────────────────────────────────────────────
  alternates: {
    canonical: APP_URL,
  },

  // ── App meta ─────────────────────────────────────────────────────────────
  applicationName: APP_NAME,
  category: 'business',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#1E3A8A' },
    { media: '(prefers-color-scheme: dark)',  color: '#1E3A8A' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <head>
        {/* JSON-LD: SoftwareApplication structured data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'HomeStayPMS',
              url: APP_URL,
              description: DEFAULT_DESCRIPTION,
              applicationCategory: 'BusinessApplication',
              operatingSystem: 'Web, iOS, Android',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'INR',
              },
              featureList: [
                'Booking calendar management',
                'Guest registry with ID verification',
                'GST invoice generation',
                'WhatsApp notifications',
                'iCal sync with Airbnb and Booking.com',
                'Revenue dashboard',
              ],
              audience: {
                '@type': 'Audience',
                audienceType: 'Homestay and guest house owners in India',
              },
            }),
          }}
        />
        {/* JSON-LD: Organization */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'HomeStayPMS',
              url: APP_URL,
              logo: `${APP_URL}/icon-512.png`,
              sameAs: [],
              contactPoint: {
                '@type': 'ContactPoint',
                contactType: 'customer support',
                availableLanguage: ['English', 'Hindi'],
              },
            }),
          }}
        />
      </head>
      <body className="h-full bg-background font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
