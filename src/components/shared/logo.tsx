import { cn } from '@/lib/utils'

export function HomeStayPMSLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 56 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('w-8 h-8', className)}
    >
      {/* House roof */}
      <path
        d="M5 24L28 5L51 24"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* House walls */}
      <path
        d="M10 22V51H46V22"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Circular arc (C-shape opening upper-right) */}
      <path
        d="M35 20A13 13 0 1 0 44 36"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      {/* Checkmark at end of arc */}
      <path
        d="M38 33L42 38L50 28"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
