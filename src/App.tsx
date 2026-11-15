import { useEffect, useState } from 'react';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
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

  const fetchWorkspacesAndAois = () => {
    fetch('/api/workspaces')
      .then((r) => r.json())
      .then((data) => {
        setWorkspaces(data.workspaces || []);
        setAois(data.aois || []);
      })
      .catch(() => {});
  };

  // Load initial workspaces, AOIs, and staged satellite connectors from Express SQLite API
  useEffect(() => {
    fetchWorkspacesAndAois();

    fetch('/api/connectors')
      .then((r) => r.json())
      .then((data) => {
        setConnectors(data.connectors || []);
      })
      .catch(() => {});
  }, []);

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
          <TrendDetectiveView lang={lang} onNavigate={(r) => handleNavigate(r)} />
        )}

        {route === 'research' && (
          <ResearchHubView lang={lang} onNavigate={(r) => handleNavigate(r)} />
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
          />
        )}

        {route === 'workspaces' && (
          <WorkspacesView
            lang={lang}
            workspaces={workspaces}
            aois={aois}
            onNavigate={handleNavigate}
            onRefresh={fetchWorkspacesAndAois}
          />
        )}

        {route === 'reports' && (
          <ReportsView lang={lang} onNavigate={(r) => handleNavigate(r)} />
        )}

        {route === 'alerts' && (
          <AlertsView lang={lang} onNavigate={(r) => handleNavigate(r)} />
        )}

        {route === 'api' && (
          <ApiPortalView
            lang={lang}
            connectors={connectors}
            onNavigate={(r) => handleNavigate(r)}
          />
        )}

        {route === 'pricing' && (
          <PricingView lang={lang} onNavigate={handleNavigate} />
        )}

        {route === 'contact' && (
          <ContactDemoView lang={lang} initialPlan={planInterest} />
        )}
      </main>

      <Footer lang={lang} onNavigate={(r) => handleNavigate(r)} />
    </div>
  );
}
