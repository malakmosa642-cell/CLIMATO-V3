import { useEffect, useState } from 'react';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import AuthModal, { AuthOrgSummary, AuthUserSummary } from './components/AuthModal';
import LandingView from './views/LandingView';
import ModulesView from './views/ModulesView';
import SectorsView from './views/SectorsView';
import DashboardView from './views/DashboardView';
import WorkspacesView from './views/WorkspacesView';
import ReportsView from './views/ReportsView';
import AlertsView from './views/AlertsView';
import ApiPortalView from './views/ApiPortalView';
import PricingView from './views/PricingView';
import ContactDemoView from './views/ContactDemoView';
import TrendDetectiveView from './views/TrendDetectiveView';
import ResearchHubView from './views/ResearchHubView';
import {
  AoiLocation,
  Language,
  ModuleId,
  PageRoute,
  SampleObservation,
  SatelliteConnector,
  SectorId,
  WorkspaceRecord,
} from './types/climate';

export default function App() {
  const [lang, setLang] = useState<Language>('en');
  const [route, setRoute] = useState<PageRoute>('landing');
  const [selectedModuleId, setSelectedModuleId] = useState<ModuleId>('delta-risk');
  const [dashboardModuleFilter, setDashboardModuleFilter] = useState<ModuleId | 'all'>('all');
  const [selectedSectorId, setSelectedSectorId] = useState<SectorId>('real-estate');
  const [selectedAoiId, setSelectedAoiId] = useState<string>('aoi-rosetta');
  const [planInterest, setPlanInterest] = useState<string>('Sector Pro');

  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [aois, setAois] = useState<AoiLocation[]>([]);
  const [connectors, setConnectors] = useState<SatelliteConnector[]>([]);

  const [authUser, setAuthUser] = useState<AuthUserSummary | null>(null);
  const [authOrg, setAuthOrg] = useState<AuthOrgSummary | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Synchronize document direction, language, and localized SEO title
  useEffect(() => {
    const html = document.documentElement;
    html.lang = lang;
    html.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title =
      lang === 'ar'
        ? 'كليماتو (CLIMATO) – منصة الذكاء المناخي الجيومكاني لمصر'
        : 'CLIMATO – Geospatial Climate Intelligence for Egypt';
  }, [lang]);

  const loadPublicSampleAoisFallback = () => {
    fetch('/api/observations?limit=50', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { observations: [] }))
      .then((data) => {
        const obsList: SampleObservation[] = data.observations || [];
        const uniqueMap = new Map<string, AoiLocation>();
        for (const o of obsList) {
          if (!uniqueMap.has(o.aoi_id)) {
            uniqueMap.set(o.aoi_id, {
              id: o.aoi_id,
              workspace_id: o.workspace_id,
              name_en: o.aoi_name_en,
              name_ar: o.aoi_name_ar,
              lat: o.lat,
              lon: o.lon,
              radius_km: 18,
              region_code: 'EG-SAMPLE',
              primary_module: o.module_id,
            });
          }
        }
        setAois(Array.from(uniqueMap.values()));
      })
      .catch(() => {});
  };

  const fetchWorkspacesAndAois = () => {
    fetch('/api/workspaces', { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) {
          setWorkspaces([]);
          loadPublicSampleAoisFallback();
          return;
        }
        const data = await r.json();
        setWorkspaces(data.workspaces || []);
        setAois(data.aois || []);
      })
      .catch(() => {});
  };

  const fetchAuthSession = () => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { authenticated: false }))
      .then((data) => {
        if (data.authenticated && data.user) {
          setAuthUser(data.user);
          setAuthOrg(data.organization || null);
        } else {
          setAuthUser(null);
          setAuthOrg(null);
        }
      })
      .catch(() => {});
  };

  // Load initial session, workspaces/AOIs, and staged satellite connectors
  useEffect(() => {
    fetchAuthSession();
    fetchWorkspacesAndAois();

    fetch('/api/connectors')
      .then((r) => r.json())
      .then((data) => {
        setConnectors(data.connectors || []);
      })
      .catch(() => {});
  }, []);

  const handleAuthSuccess = (user: AuthUserSummary, org: AuthOrgSummary | null) => {
    setAuthUser(user);
    setAuthOrg(org);
    fetchWorkspacesAndAois();
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    setAuthUser(null);
    setAuthOrg(null);
    fetchWorkspacesAndAois();
  };

  const handleNavigate = (
    targetRoute: PageRoute,
    opts?: { moduleId?: ModuleId; sectorId?: SectorId; aoiId?: string; planInterest?: string }
  ) => {
    if (opts?.moduleId) {
      setSelectedModuleId(opts.moduleId);
      setDashboardModuleFilter(opts.moduleId);
    }
    if (opts?.sectorId) {
      setSelectedSectorId(opts.sectorId);
    }
    if (opts?.aoiId) {
      setSelectedAoiId(opts.aoiId);
    }
    if (opts?.planInterest) {
      setPlanInterest(opts.planInterest);
    }
    setRoute(targetRoute);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const authProps = {
    authUser,
    authOrg,
    onOpenAuth: () => setShowAuthModal(true),
    onLogout: handleLogout,
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#020403] text-slate-100">
      <Navbar
        lang={lang}
        onToggleLang={() => setLang((prev) => (prev === 'en' ? 'ar' : 'en'))}
        route={route}
        onNavigate={(r) => handleNavigate(r)}
      />

      <main className="flex-1">
        {route === 'landing' && (
          <LandingView
            lang={lang}
            aois={aois}
            connectors={connectors}
            onNavigate={handleNavigate}
          />
        )}

        {route === 'detective' && (
          <TrendDetectiveView lang={lang} onNavigate={(r) => handleNavigate(r)} {...authProps} />
        )}

        {route === 'research' && (
          <ResearchHubView lang={lang} onNavigate={(r) => handleNavigate(r)} {...authProps} />
        )}

        {route === 'modules' && (
          <ModulesView
            lang={lang}
            selectedModuleId={selectedModuleId}
            onSelectModule={setSelectedModuleId}
            onNavigate={handleNavigate}
          />
        )}

        {route === 'sectors' && (
          <SectorsView
            lang={lang}
            selectedSectorId={selectedSectorId}
            onSelectSector={setSelectedSectorId}
            onNavigate={handleNavigate}
          />
        )}

        {route === 'dashboard' && (
          <DashboardView
            lang={lang}
            workspaces={workspaces}
            aois={aois}
            selectedModuleId={dashboardModuleFilter}
            selectedAoiId={selectedAoiId}
            onSelectModule={setDashboardModuleFilter}
            onSelectAoi={setSelectedAoiId}
            onNavigate={(r) => handleNavigate(r)}
            {...authProps}
          />
        )}

        {route === 'workspaces' && (
          <WorkspacesView
            lang={lang}
            workspaces={workspaces}
            aois={aois}
            onNavigate={handleNavigate}
            onRefresh={fetchWorkspacesAndAois}
            {...authProps}
          />
        )}

        {route === 'reports' && (
          <ReportsView lang={lang} onNavigate={(r) => handleNavigate(r)} {...authProps} />
        )}

        {route === 'alerts' && (
          <AlertsView lang={lang} onNavigate={(r) => handleNavigate(r)} {...authProps} />
        )}

        {route === 'api' && (
          <ApiPortalView
            lang={lang}
            connectors={connectors}
            onNavigate={(r) => handleNavigate(r)}
            authUser={authUser}
            onOpenAuth={() => setShowAuthModal(true)}
          />
        )}

        {route === 'pricing' && (
          <PricingView lang={lang} onNavigate={handleNavigate} />
        )}

        {route === 'contact' && (
          <ContactDemoView lang={lang} initialPlan={planInterest} />
        )}
      </main>

      <AuthModal
        lang={lang}
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={handleAuthSuccess}
      />

      <Footer lang={lang} onNavigate={(r) => handleNavigate(r)} />
    </div>
  );
}
