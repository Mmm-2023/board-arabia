import { Navigate, Route, Routes } from 'react-router-dom'
import { AboutPage } from './pages/AboutPage'
import { AdminPage } from './pages/AdminPage'
import { ApplyPage } from './pages/ApplyPage'
import { AuthConfirmPage } from './pages/AuthConfirmPage'
import { ForCapitalPage } from './pages/ForCapitalPage'
import { ForMembersPage } from './pages/ForMembersPage'
import { HowItWorksPage } from './pages/HowItWorksPage'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { PartnersPage } from './pages/PartnersPage'
import { PrivacyPage } from './pages/PrivacyPage'
import { TermsPage } from './pages/TermsPage'
import { DashboardHome } from './pages/dashboard/DashboardHome'
import { DashboardLayout } from './pages/dashboard/DashboardLayout'
import { ModulePage } from './pages/dashboard/ModulePage'
import { ProfilePage } from './pages/dashboard/ProfilePage'

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
      <Route path="/auth/confirm" element={<AuthConfirmPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/ops" element={<AdminPage />} />
      <Route path="/dashboard" element={<DashboardLayout />}>
        <Route index element={<DashboardHome />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="directory" element={<ModulePage id="directory" />} />
        <Route path="mandates" element={<ModulePage id="mandates" />} />
        <Route path="intros" element={<ModulePage id="intros" />} />
        <Route path="rooms" element={<ModulePage id="rooms" />} />
        <Route path="events" element={<ModulePage id="events" />} />
      </Route>
      {/* Legacy book/verify routes redirect — public calendar CTA removed */}
      <Route path="/book" element={<Navigate to="/apply" replace />} />
      <Route path="/verify" element={<Navigate to="/apply" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
