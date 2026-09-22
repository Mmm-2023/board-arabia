import { Navigate, Route, Routes } from 'react-router-dom'
import { AboutPage } from './pages/AboutPage'
import { AdminPage } from './pages/AdminPage'
import { ApplyPage } from './pages/ApplyPage'
import { ForCapitalPage } from './pages/ForCapitalPage'
import { ForMembersPage } from './pages/ForMembersPage'
import { HowItWorksPage } from './pages/HowItWorksPage'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { PartnersPage } from './pages/PartnersPage'
import { PrivacyPage } from './pages/PrivacyPage'
import { TermsPage } from './pages/TermsPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/apply" element={<ApplyPage />} />
      <Route path="/for-members" element={<ForMembersPage />} />
      <Route path="/for-capital" element={<ForCapitalPage />} />
      <Route path="/partners" element={<PartnersPage />} />
      <Route path="/how-it-works" element={<HowItWorksPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/ops" element={<AdminPage />} />
      {/* Legacy book/verify routes redirect — public calendar CTA removed */}
      <Route path="/book" element={<Navigate to="/apply" replace />} />
      <Route path="/verify" element={<Navigate to="/apply" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
