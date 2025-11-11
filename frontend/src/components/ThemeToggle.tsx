import { MoonIcon, SunIcon } from '@heroicons/react/24/solid'
import clsx from 'clsx'

export type ThemeMode = 'dark' | 'light'

interface ThemeToggleProps {
  theme: ThemeMode
  onToggle: (mode: ThemeMode) => void
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const nextTheme = theme === 'dark' ? 'light' : 'dark'
  const label = theme === 'dark' ? 'Helles Design aktivieren' : 'Dunkles Design aktivieren'

  return (
    <button
      type="button"
      onClick={() => onToggle(nextTheme)}
      className={clsx(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        theme === 'dark'
          ? 'border-slate-700 bg-slate-950/60 text-slate-200 hover:border-primary hover:text-primary'
          : 'border-slate-300 bg-white/80 text-slate-700 hover:border-primary hover:text-primary',
      )}
      title={label}
      aria-label={label}
    >
      {theme === 'dark' ? (
        <SunIcon className="h-4 w-4" />
      ) : (
        <MoonIcon className="h-4 w-4" />
      )}
      <span>{theme === 'dark' ? 'Bright-Mode' : 'Dark-Mode'}</span>
    </button>
  )
}
