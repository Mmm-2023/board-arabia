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
import { StaffRoomsPage } from './pages/admin/StaffRoomsPage'
import { PeoplePage } from './pages/admin/PeoplePage'
import { SettingsPage } from './pages/admin/SettingsPage'
import { DashboardHome } from './pages/dashboard/DashboardHome'
import { DashboardLayout } from './pages/dashboard/DashboardLayout'
import { AiToolsHome } from './pages/dashboard/AiToolsHome'
import { AiToolsLayout } from './pages/dashboard/AiToolsLayout'
import { DealsIndexRedirect, DealsLayout } from './pages/dashboard/DealsLayout'
import { DirectoryPage } from './pages/dashboard/DirectoryPage'
import { DueDiligencePage } from './pages/dashboard/DueDiligencePage'
import { HelpPage } from './pages/dashboard/HelpPage'
import { MajlisPage } from './pages/dashboard/MajlisPage'
import { MandatesPage } from './pages/dashboard/MandatesPage'
import { PeopleIndexRedirect, PeopleLayout } from './pages/dashboard/PeopleLayout'
import { RealEstatePage } from './pages/dashboard/RealEstatePage'
import { CreateRoomPage } from './pages/dashboard/CreateRoomPage'
import { DealRoomPage } from './pages/dashboard/DealRoomPage'
import { RoomsPage } from './pages/dashboard/RoomsPage'
import { NetworkPage } from './pages/dashboard/NetworkPage'
import { ProfilePage } from './pages/dashboard/ProfilePage'
import { RedirectKeep } from './shell/RedirectKeep'

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
        <Route path="rooms" element={<StaffRoomsPage />} />
      </Route>
      <Route path="/ops/*" element={<Navigate to="/admin" replace />} />
      <Route path="/ops" element={<Navigate to="/admin" replace />} />
      <Route path="/dashboard" element={<DashboardLayout />}>
        <Route index element={<DashboardHome />} />
        <Route path="deals" element={<DealsLayout />}>
          <Route index element={<DealsIndexRedirect />} />
          <Route path="mandates" element={<MandatesPage />} />
          <Route path="real-estate" element={<RealEstatePage />} />
          <Route path="rooms" element={<RoomsPage />} />
          <Route path="rooms/new" element={<CreateRoomPage />} />
          <Route path="rooms/:roomId" element={<DealRoomPage />} />
        </Route>
        <Route path="people" element={<PeopleLayout />}>
          <Route index element={<PeopleIndexRedirect />} />
          <Route path="directory" element={<DirectoryPage />} />
          <Route path="invites" element={<NetworkPage />} />
        </Route>
        <Route path="majlis" element={<MajlisPage />} />
        <Route path="ai" element={<AiToolsLayout />}>
          <Route index element={<AiToolsHome />} />
          <Route path="due-diligence" element={<DueDiligencePage />} />
          <Route path="due-diligence/:reportId" element={<DueDiligencePage />} />
        </Route>
        <Route path="profile" element={<ProfilePage />} />
        <Route path="help" element={<HelpPage />} />
        <Route path="directory" element={<RedirectKeep />} />
        <Route path="mandates" element={<RedirectKeep />} />
        <Route path="real-estate" element={<RedirectKeep />} />
        <Route path="network" element={<RedirectKeep />} />
        <Route path="invites" element={<RedirectKeep />} />
        <Route path="intros" element={<RedirectKeep />} />
        <Route path="due-diligence" element={<RedirectKeep />} />
        <Route path="due-diligence/:reportId" element={<RedirectKeep />} />
        <Route path="rooms" element={<RedirectKeep />} />
        <Route path="rooms/new" element={<RedirectKeep />} />
        <Route path="rooms/:roomId" element={<RedirectKeep />} />
        <Route path="events" element={<RedirectKeep />} />
        <Route path="*" element={<RedirectKeep />} />
      </Route>
      {/* Legacy book/verify routes redirect. Public calendar CTA removed. */}
      <Route path="/book" element={<Navigate to="/apply" replace />} />
      <Route path="/verify" element={<Navigate to="/apply" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
