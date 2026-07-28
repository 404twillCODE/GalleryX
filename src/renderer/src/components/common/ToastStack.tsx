import { useEffect } from 'react'
import { AlertTriangle, Info, X } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'

export function ToastStack(): JSX.Element {
  const toasts = useAppStore((s) => s.toasts)
  const dismissToast = useAppStore((s) => s.dismissToast)

  useEffect(() => {
    if (!toasts.length) return
    const timers = toasts.map((t) => setTimeout(() => dismissToast(t.id), 10000))
    return () => timers.forEach(clearTimeout)
  }, [toasts, dismissToast])

  if (!toasts.length) return <></>

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="panel px-4 py-3 flex items-start gap-2.5 animate-toast-in shadow-floating"
        >
          {t.tone === 'error' ? (
            <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
          ) : (
            <Info size={16} className="text-accent flex-shrink-0 mt-0.5" />
          )}
          <div className="text-sm text-neutral-200 leading-snug">{t.message}</div>
          <button
            className="text-neutral-500 hover:text-white flex-shrink-0 ml-auto no-drag"
            onClick={() => dismissToast(t.id)}
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}
