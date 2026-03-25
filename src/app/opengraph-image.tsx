import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'HomeStayPMS — Homestay Property Management'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #1E3A8A 0%, #1d4ed8 50%, #1E3A8A 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
        }}
      >
        {/* Subtle grid background */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'radial-gradient(circle at 25% 25%, rgba(255,255,255,0.05) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(255,255,255,0.05) 0%, transparent 50%)',
          }}
        />

        {/* Logo area */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            marginBottom: 32,
          }}
        >
          {/* House icon */}
          <div
            style={{
              width: 80,
              height: 80,
              background: 'rgba(255,255,255,0.15)',
              borderRadius: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 48,
              border: '2px solid rgba(255,255,255,0.3)',
            }}
          >
            🏠
          </div>
          <div
            style={{
              fontSize: 56,
              fontWeight: 800,
              color: 'white',
              letterSpacing: '-1px',
            }}
          >
            HomeStay<span style={{ color: '#FCD34D' }}>PMS</span>
          </div>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 28,
            color: 'rgba(255,255,255,0.85)',
            textAlign: 'center',
            maxWidth: 700,
            lineHeight: 1.4,
            marginBottom: 48,
          }}
        >
          Property management built for Indian homestay owners
        </div>

        {/* Feature chips */}
        <div
          style={{
            display: 'flex',
            gap: 16,
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          {[
            'Booking Calendar',
            'GST Invoices',
            'WhatsApp Alerts',
            'iCal Sync',
            'Guest Registry',
          ].map((feature) => (
            <div
              key={feature}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: 100,
                padding: '8px 20px',
                fontSize: 18,
                color: 'white',
                backdropFilter: 'blur(10px)',
              }}
            >
              {feature}
            </div>
          ))}
        </div>

        {/* Domain */}
        <div
          style={{
            position: 'absolute',
            bottom: 32,
            fontSize: 20,
            color: 'rgba(255,255,255,0.5)',
          }}
        >
          homestaypms.com
        </div>
      </div>
    ),
    { ...size }
  )
}
