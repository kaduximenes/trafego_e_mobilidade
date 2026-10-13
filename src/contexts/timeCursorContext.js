// Contexto do cursor temporal, em módulo próprio para que o provider possa ser
// o único export do seu arquivo (fast refresh) e para o hook ser reutilizável.

import { createContext, useContext } from 'react'

export const TimeCursorContext = createContext(null)

// `cursor === null` significa AO VIVO. Qualquer outro valor é um instante ISO
// em modo histórico.
export function useTimeCursor() {
  const context = useContext(TimeCursorContext)
  if (!context) {
    throw new Error('useTimeCursor precisa estar dentro de <TimeCursorProvider>.')
  }
  return context
}
