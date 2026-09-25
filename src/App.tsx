import { Navigate, Route, Routes } from 'react-router-dom'
import { AboutPage } from './pages/AboutPage'
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
import { AdminLayout } from './pages/admin/AdminLayout'
import { AdminHome } from './pages/admin/AdminHome'
import { ApplicationsPage } from './pages/admin/ApplicationsPage'
import { CapacityPage } from './pages/admin/CapacityPage'
import { EmailPage } from './pages/admin/EmailPage'
import { AdminMajlisPage } from './pages/admin/MajlisPage'
import { PeoplePage } from './pages/admin/PeoplePage'
import { SettingsPage } from './pages/admin/SettingsPage'
import { DashboardHome } from './pages/dashboard/DashboardHome'
import { DashboardLayout } from './pages/dashboard/DashboardLayout'
import { DirectoryPage } from './pages/dashboard/DirectoryPage'
import { HelpPage } from './pages/dashboard/HelpPage'
import { MajlisPage } from './pages/dashboard/MajlisPage'
import { MandatesPage } from './pages/dashboard/MandatesPage'
import { ModulePage } from './pages/dashboard/ModulePage'
import { NetworkPage } from './pages/dashboard/NetworkPage'
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
      <Route path="/auth/reset" element={<AuthConfirmPage />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminHome />} />
        <Route path="applications" element={<ApplicationsPage />} />
        <Route path="people" element={<PeoplePage />} />
        <Route path="capacity" element={<CapacityPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="email" element={<EmailPage />} />
        <Route path="majlis" element={<AdminMajlisPage />} />
      </Route>
      <Route path="/ops/*" element={<Navigate to="/admin" replace />} />
      <Route path="/ops" element={<Navigate to="/admin" replace />} />
      <Route path="/dashboard" element={<DashboardLayout />}>
        <Route index element={<DashboardHome />} />
        <Route path="directory" element={<DirectoryPage />} />
        <Route path="mandates" element={<MandatesPage />} />
        <Route path="network" element={<NetworkPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="invites" element={<Navigate to="/dashboard/network" replace />} />
        <Route path="intros" element={<Navigate to="/dashboard/network" replace />} />
        <Route path="rooms" element={<ModulePage id="rooms" />} />
        <Route path="majlis" element={<MajlisPage />} />
        <Route path="events" element={<Navigate to="/dashboard/majlis" replace />} />
        <Route path="help" element={<HelpPage />} />
      </Route>
      {/* Legacy book/verify routes redirect. Public calendar CTA removed. */}
      <Route path="/book" element={<Navigate to="/apply" replace />} />
      <Route path="/verify" element={<Navigate to="/apply" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
