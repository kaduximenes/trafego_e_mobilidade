import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronUp, LayoutDashboard, Search, X } from 'lucide-react'
import { period } from '../../data/mockData'

function findTextMatches(query, excludedRoot) {
  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR')
  if (!normalizedQuery) return []

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const ranges = []
  let node

  while ((node = walker.nextNode())) {
    if (excludedRoot?.contains(node)) continue
    const parent = node.parentElement
    if (!parent || !parent.getClientRects().length || parent.closest('script, style, input, textarea, button, select')) continue

    const text = node.textContent.toLocaleLowerCase('pt-BR')
    let offset = 0
    let matchIndex = text.indexOf(normalizedQuery, offset)

    while (matchIndex !== -1) {
      const range = document.createRange()
      range.setStart(node, matchIndex)
      range.setEnd(node, matchIndex + normalizedQuery.length)
      ranges.push(range)
      offset = matchIndex + normalizedQuery.length
      matchIndex = text.indexOf(normalizedQuery, offset)
    }
  }

  return ranges
}

export function Header({ summaryOpen = false, onToggleSummary }) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [resultCount, setResultCount] = useState(0)
  const resultsRef = useRef([])
  const activeResultRef = useRef(0)
  const searchRef = useRef(null)

  useEffect(() => {
    if (!query.trim()) {
      return undefined
    }

    const ranges = resultsRef.current

    if (globalThis.CSS?.highlights && typeof globalThis.Highlight !== 'undefined') {
      let style = document.getElementById('dashboard-search-highlight-style')
      if (!style) {
        style = document.createElement('style')
        style.id = 'dashboard-search-highlight-style'
        style.textContent = '::highlight(dashboard-search) { background-color: rgba(250, 204, 21, 0.7); color: #13335a; }'
        document.head.append(style)
      }
      globalThis.CSS.highlights.set('dashboard-search', new globalThis.Highlight(...ranges))
    }

    ranges[0]?.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' })

    return () => {
      globalThis.CSS?.highlights?.delete('dashboard-search')
    }
  }, [query])

  function moveToResult(direction) {
    const ranges = resultsRef.current
    if (!ranges.length) return

    activeResultRef.current = (activeResultRef.current + direction + ranges.length) % ranges.length
    const range = ranges[activeResultRef.current]
    range.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  function closeSearch() {
    setSearchOpen(false)
    setQuery('')
    setResultCount(0)
    resultsRef.current = []
    activeResultRef.current = 0
  }

  return (
    <header className="relative isolate overflow-hidden rounded-lg border border-[#2a688f] bg-[#13335a] px-4 py-3 shadow-[0_14px_40px_-20px_rgba(19,51,90,0.55)]">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-0 size-14 bg-[#42b9eb]"
        style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }}
      />
      <div className="relative flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-3">
          <div className="relative aspect-[368/138] w-32 shrink-0 overflow-hidden sm:w-40 lg:w-44">
            <img
              src="/logo-prefeitura-rio-cor-blue.png"
              alt="Prefeitura Rio e Centro de Operações Rio"
              className="h-10 w-auto object-contain"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h1 className="w-full min-w-0 flex-none text-base font-black uppercase leading-tight text-white sm:w-auto sm:flex-1 sm:basis-48 sm:text-lg md:text-xl">
                Tráfego e Mobilidade Urbana
              </h1>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-ok" />
                </span>
                Ao vivo
              </span>
            </div>
            <p className="mt-1 text-sm text-white/75">{period.label}</p>
          </div>
        </div>
        <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 self-start lg:w-auto lg:flex-nowrap lg:self-auto">
          {searchOpen ? (
            <div ref={searchRef} className="flex items-center gap-1 rounded-lg border border-white/25 bg-white/15 px-2 py-1.5 text-white shadow-sm backdrop-blur-md">
              <Search size={15} className="shrink-0 text-white/65" aria-hidden="true" />
              <input
                autoFocus
                type="search"
                value={query}
                onChange={(event) => {
                  const nextQuery = event.target.value
                  const ranges = findTextMatches(nextQuery, searchRef.current)
                  resultsRef.current = ranges
                  activeResultRef.current = 0
                  setResultCount(ranges.length)
                  setQuery(nextQuery)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    moveToResult(event.shiftKey ? -1 : 1)
                  } else if (event.key === 'Escape') {
                    closeSearch()
                  }
                }}
                placeholder="Buscar na tela…"
                aria-label="Buscar palavras na tela"
                className="w-24 bg-transparent text-xs text-white outline-none placeholder:text-white/60 sm:w-48"
              />
              <span className="min-w-10 text-center text-[10px] text-white/70" aria-live="polite">
                {query.trim() ? `${resultCount} resultado${resultCount === 1 ? '' : 's'}` : ''}
              </span>
              <button type="button" onClick={() => moveToResult(-1)} aria-label="Resultado anterior" className="rounded p-1 text-white/75 hover:bg-white/15 hover:text-white">
                <ChevronUp size={14} />
              </button>
              <button type="button" onClick={() => moveToResult(1)} aria-label="Próximo resultado" className="rounded p-1 text-white/75 hover:bg-white/15 hover:text-white">
                <ChevronDown size={14} />
              </button>
              <button type="button" onClick={closeSearch} aria-label="Fechar busca" className="rounded p-1 text-white/75 hover:bg-white/15 hover:text-white">
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Abrir busca na tela"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/25 bg-white/10 text-white/75 backdrop-blur-sm transition-colors hover:border-white/50 hover:bg-white/20 hover:text-white"
            >
              <Search size={17} />
            </button>
          )}
          {onToggleSummary && (
            <button
              type="button"
              onClick={onToggleSummary}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition-colors hover:border-white/50 hover:bg-white/15"
            >
              {summaryOpen ? <ArrowLeft size={15} /> : <LayoutDashboard size={15} />}
              {summaryOpen ? 'Voltar ao mapa' : 'Análise ampla dos indicadores'}
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
