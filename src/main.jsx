import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// O CSS do Leaflet precisa vir antes do index.css para que o tema escuro
// (definido em index.css) sobrescreva os estilos padrão da biblioteca.
import 'leaflet/dist/leaflet.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
