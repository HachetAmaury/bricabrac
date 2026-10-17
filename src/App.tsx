import { useState } from 'react';
import { AppProvider } from './state/AppContext';
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

function Shell() {
  const [tab, setTab] = useState<TabId>('events');
  const [menuOpen, setMenuOpen] = useState(false);

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
        <TabBar active={tab} onSelect={setTab} />
      </div>
      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} />
    </ChromeProvider>
  );
}

function Gate() {
  const { status, session } = useAuth();
  if (status === 'loading') {
    return <p style={{ textAlign: 'center', marginTop: '40vh' }}>Chargement…</p>;
  }
  if (status === 'signedOut' || !session) return <LoginView />;
  // Keyed by user so switching accounts never carries one account's state over.
  return (
    <AppProvider key={session.user.id}>
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
