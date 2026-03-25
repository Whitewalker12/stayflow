import { HomeStayPMSLogo } from '@/components/shared/logo'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-900 mb-4">
            <HomeStayPMSLogo className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">HomeStayPMS</h1>
          <p className="text-sm text-gray-500 mt-1">Homestay management, simplified</p>
        </div>
        {children}
      </div>
    </div>
  )
}
