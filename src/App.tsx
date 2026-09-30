import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AnalyticsRoot } from './components/AnalyticsRoot'
import { SiteLanguageProvider } from './components/SiteLanguage'
import { AboutPage } from './pages/AboutPage'
import { ApplyPage } from './pages/ApplyPage'
import { RegisterPage } from './pages/RegisterPage'
import { VerifyPage } from './pages/VerifyPage'
import { AuthConfirmPage } from './pages/AuthConfirmPage'
import { ForCapitalPage } from './pages/ForCapitalPage'
import { ForMembersPage } from './pages/ForMembersPage'
import { HowItWorksPage } from './pages/HowItWorksPage'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { PartnersPage } from './pages/PartnersPage'
import { PrivacyPage } from './pages/PrivacyPage'
import { TermsPage } from './pages/TermsPage'
import { RedirectKeep } from './shell/RedirectKeep'

const AdminLayout = lazy(() => import('./pages/admin/AdminLayout').then((m) => ({ default: m.AdminLayout })))
const AdminMandateMatchPage = lazy(() =>
  import('./pages/admin/AdminMandateMatchPage').then((m) => ({ default: m.AdminMandateMatchPage })),
)
const AdminMandatesPage = lazy(() =>
  import('./pages/admin/AdminMandatesPage').then((m) => ({ default: m.AdminMandatesPage })),
)
const AdminHome = lazy(() => import('./pages/admin/AdminHome').then((m) => ({ default: m.AdminHome })))
const ApplicationsPage = lazy(() =>
  import('./pages/admin/ApplicationsPage').then((m) => ({ default: m.ApplicationsPage })),
)
const MembershipQueuePage = lazy(() =>
  import('./pages/admin/MembershipPages').then((m) => ({ default: m.MembershipQueuePage })),
)
const MembershipDetailPage = lazy(() =>
  import('./pages/admin/MembershipPages').then((m) => ({ default: m.MembershipDetailPage })),
)
const CapacityPage = lazy(() => import('./pages/admin/CapacityPage').then((m) => ({ default: m.CapacityPage })))
const EmailPage = lazy(() => import('./pages/admin/EmailPage').then((m) => ({ default: m.EmailPage })))
const AdminMajlisPage = lazy(() => import('./pages/admin/MajlisPage').then((m) => ({ default: m.AdminMajlisPage })))
const StaffRoomsPage = lazy(() => import('./pages/admin/StaffRoomsPage').then((m) => ({ default: m.StaffRoomsPage })))
const AdminIntrosPage = lazy(() => import('./pages/admin/AdminIntrosPage').then((m) => ({ default: m.AdminIntrosPage })))
const AdminPeopleLayout = lazy(() =>
  import('./pages/admin/PeopleLayout').then((m) => ({ default: m.AdminPeopleLayout })),
)
const PeoplePage = lazy(() => import('./pages/admin/PeoplePage').then((m) => ({ default: m.PeoplePage })))
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const MarketingPage = lazy(() => import('./pages/admin/MarketingPage').then((m) => ({ default: m.MarketingPage })))
const DashboardHome = lazy(() =>
  import('./pages/dashboard/DashboardHome').then((m) => ({ default: m.DashboardHome })),
)
const DashboardLayout = lazy(() =>
  import('./pages/dashboard/DashboardLayout').then((m) => ({ default: m.DashboardLayout })),
)
const AiToolsHome = lazy(() => import('./pages/dashboard/AiToolsHome').then((m) => ({ default: m.AiToolsHome })))
const AiToolsLayout = lazy(() =>
  import('./pages/dashboard/AiToolsLayout').then((m) => ({ default: m.AiToolsLayout })),
)
const DealsLayout = lazy(() => import('./pages/dashboard/DealsLayout').then((m) => ({ default: m.DealsLayout })))
const DealsIndexRedirect = lazy(() =>
  import('./pages/dashboard/DealsLayout').then((m) => ({ default: m.DealsIndexRedirect })),
)
const DirectoryPage = lazy(() => import('./pages/dashboard/DirectoryPage').then((m) => ({ default: m.DirectoryPage })))
const DueDiligencePage = lazy(() =>
  import('./pages/dashboard/DueDiligencePage').then((m) => ({ default: m.DueDiligencePage })),
)
const HelpPage = lazy(() => import('./pages/dashboard/HelpPage').then((m) => ({ default: m.HelpPage })))
const IntrosPage = lazy(() => import('./pages/dashboard/IntrosPage').then((m) => ({ default: m.IntrosPage })))
const MajlisPage = lazy(() => import('./pages/dashboard/MajlisPage').then((m) => ({ default: m.MajlisPage })))
const MandatesPage = lazy(() => import('./pages/dashboard/MandatesPage').then((m) => ({ default: m.MandatesPage })))
const PeopleLayout = lazy(() => import('./pages/dashboard/PeopleLayout').then((m) => ({ default: m.PeopleLayout })))
const PeopleIndexRedirect = lazy(() =>
  import('./pages/dashboard/PeopleLayout').then((m) => ({ default: m.PeopleIndexRedirect })),
)
const RealEstatePage = lazy(() =>
  import('./pages/dashboard/RealEstatePage').then((m) => ({ default: m.RealEstatePage })),
)
const CreateRoomPage = lazy(() =>
  import('./pages/dashboard/CreateRoomPage').then((m) => ({ default: m.CreateRoomPage })),
)
const DealRoomPage = lazy(() => import('./pages/dashboard/DealRoomPage').then((m) => ({ default: m.DealRoomPage })))
const RoomsPage = lazy(() => import('./pages/dashboard/RoomsPage').then((m) => ({ default: m.RoomsPage })))
const NetworkPage = lazy(() => import('./pages/dashboard/NetworkPage').then((m) => ({ default: m.NetworkPage })))
const ProfilePage = lazy(() => import('./pages/dashboard/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const SponsorshipPage = lazy(() =>
  import('./pages/dashboard/SponsorshipPage').then((m) => ({ default: m.SponsorshipPage })),
)

export default function App() {
  return (
    <SiteLanguageProvider>
    <AnalyticsRoot />
    <Suspense fallback={<p role="status">Loading</p>}>
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/apply" element={<ApplyPage />} />
      <Route path="/apply/verify" element={<Navigate to="/register/verify" replace />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/register/verify" element={<VerifyPage />} />
      <Route path="/for-members" element={<ForMembersPage />} />
      <Route path="/for-capital" element={<ForCapitalPage />} />
      <Route path="/partners" element={<PartnersPage />} />
      <Route path="/how-it-works" element={<HowItWorksPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/login/staff" element={<LoginPage />} />
      <Route path="/auth/confirm" element={<AuthConfirmPage />} />
      <Route path="/auth/reset" element={<AuthConfirmPage />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminHome />} />
        <Route path="applications" element={<ApplicationsPage />} />
        <Route path="review" element={<MembershipQueuePage />} />
        <Route path="review/:candidateId" element={<MembershipDetailPage />} />
        <Route path="people" element={<AdminPeopleLayout />}>
          <Route index element={<PeoplePage />} />
          <Route path="intros" element={<AdminIntrosPage />} />
        </Route>
        <Route path="capacity" element={<CapacityPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="marketing" element={<MarketingPage />} />
        <Route path="email" element={<EmailPage />} />
        <Route path="majlis" element={<AdminMajlisPage />} />
        <Route path="mandates" element={<AdminMandatesPage />} />
        <Route path="mandates/:mandateId" element={<AdminMandateMatchPage />} />
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
          <Route path="intros" element={<IntrosPage />} />
          <Route path="invites" element={<NetworkPage />} />
        </Route>
        <Route path="majlis" element={<MajlisPage />} />
        <Route path="ai" element={<AiToolsLayout />}>
          <Route index element={<AiToolsHome />} />
          <Route path="due-diligence" element={<DueDiligencePage />} />
          <Route path="due-diligence/:reportId" element={<DueDiligencePage />} />
          <Route path=":toolSlug" element={<AiToolPage />} />
          <Route path=":toolSlug/:jobId" element={<AiToolPage />} />
        </Route>
        <Route path="profile" element={<ProfilePage />} />
        <Route path="help" element={<HelpPage />} />
        <Route path="sponsorship" element={<SponsorshipPage />} />
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
    </Suspense>
    </SiteLanguageProvider>
  )
}

const AiToolPage = lazy(() => import('./pages/dashboard/AiToolPage').then((m) => ({ default: m.AiToolPage })))
