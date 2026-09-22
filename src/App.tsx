import { Navigate, Route, Routes } from 'react-router-dom'
import { AdminPage } from './pages/AdminPage'
import { BookPage } from './pages/BookPage'
import { LandingPage } from './pages/LandingPage'
import { VerifyPage } from './pages/VerifyPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/book" element={<BookPage />} />
      <Route path="/verify" element={<VerifyPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/ops" element={<AdminPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
