export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gray-900 mb-4">
            <span className="text-white font-bold text-lg">S</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">StayFlow</h1>
          <p className="text-sm text-gray-500 mt-1">Homestay management, simplified</p>
        </div>
        {children}
      </div>
    </div>
  )
}
