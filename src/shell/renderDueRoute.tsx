import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import App from '../App'

export function renderRoute(entry: string) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[entry]}>
      <App />
    </MemoryRouter>
  )
}
