import { useEffect, useState } from 'react';
import { AppProvider, useApp } from './state/AppContext';
import { AuthProvider, useAuth } from './state/AuthContext';
import { LoginView } from './views/LoginView';
import { TabBar, type TabId } from './components/TabBar';
import { ChromeProvider } from './components/ui/chrome';
import { Drawer } from './components/ui/Drawer';
import { CatalogView } from './views/CatalogView';
import { EventsView } from './views/EventsView';
import { ReportView } from './views/ReportView';
import { SellView } from './views/SellView';
import { CashView } from './views/CashView';
import { AdminView } from './views/AdminView';
import { ImportLocalModal } from './components/ImportLocalModal';
import { supabase } from './lib/supabase';
import { uuid } from './lib/uuid';
import type { Backup } from './lib/backup';
import { LEGACY_KEYS, loadJSON } from './state/persistence';
import { clearLegacyData, hasLegacyData, runImport } from './sync/importLocal';
import { RejectedSalesDialog as RejectedSalesList, exportRejectedSales } from './components/RejectedSalesDialog';

/** The app's rejected list, from the sync layer. */
export function RejectedSalesDialog() {
  const { rejected, dismissRejected } = useApp();
  return (
    <RejectedSalesList sales={rejected} onDismiss={dismissRejected} onExport={() => exportRejectedSales(rejected)} />
  );
}

function Shell() {
  const [tab, setTab] = useState<TabId>('events');
  const [menuOpen, setMenuOpen] = useState(false);
  const { userId, profile } = useAuth();
  const { refresh } = useApp();
  // Decided once per sign-in (Shell is remounted per user): later writes to the
  // legacy keys never re-trigger the prompt.
  const [legacy, setLegacy] = useState(() => hasLegacyData());
  const isMember = profile !== null && !profile.isAdmin;

  // Members never owned the old local data: drop it silently, once.
  useEffect(() => {
    if (legacy && isMember) {
      clearLegacyData();
      setLegacy(false);
    }
  }, [legacy, isMember]);

  const importLegacy = async () => {
    const data: Backup = {
      catalog: loadJSON(LEGACY_KEYS.catalog, []),
      categories: loadJSON(LEGACY_KEYS.categories, []),
      events: loadJSON(LEGACY_KEYS.events, [])
    };
    await runImport(supabase, data, {
      catalogId: uuid(),
      catalogName: 'Catalogue importé',
      sellerId: userId!
    });
    // Keys are already cleared: a refresh failure must not surface as an import error.
    await refresh().catch(() => {});
    setLegacy(false);
  };

  const ignoreLegacy = () => {
    if (!confirm('Les données locales seront effacées. Continuer ?')) return;
    clearLegacyData();
    setLegacy(false);
  };

  return (
    <ChromeProvider openMenu={() => setMenuOpen(true)}>
      <div
        style={{
          minHeight: '100%',
          // #root is a fixed-height (100vh) flex column, so this shell is a
          // flex item. Without flexShrink:0 the explicit minHeight below lets
          // flex-shrink clamp the shell to the viewport height — its content
          // then overflows *past* the padding, leaving the last row behind the
          // bar. Pinning flex-shrink lets the shell grow to its content so the
          // reserved space actually sits below the final row.
          flexShrink: 0,
          // Reserve the tab-bar height plus a comfortable gap so the last row of
          // any scrolling view (Caisse bilan, Rapport, …) clears the translucent
          // bar instead of hiding behind it.
          paddingBottom: 'calc(var(--tab-height) + var(--safe-bottom) + 24px)'
        }}
      >
        {tab === 'events' && <EventsView />}
        {tab === 'sell' && <SellView />}
        {tab === 'report' && <ReportView />}
        {tab === 'cash' && <CashView />}
        {tab === 'catalog' && <CatalogView />}
        {tab === 'admin' && <AdminView onBack={() => setTab('events')} />}
        <TabBar active={tab} onSelect={setTab} />
      </div>
      <Drawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onOpenAdmin={() => {
          setTab('admin');
          setMenuOpen(false);
        }}
      />
      <RejectedSalesDialog />
      <ImportLocalModal open={legacy && profile?.isAdmin === true} onImport={importLegacy} onIgnore={ignoreLegacy} />
    </ChromeProvider>
  );
}

function Gate() {
  const { status, userId } = useAuth();
  if (status === 'loading') {
    return <p style={{ textAlign: 'center', marginTop: '40vh' }}>Chargement…</p>;
  }
  if (status === 'signedOut' || !userId) return <LoginView />;
  // Keyed by user so switching accounts never carries one account's state over.
  return (
    <AppProvider key={userId}>
      <Shell />
    </AppProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
