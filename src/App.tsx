import { useState } from 'react';
import { AppProvider } from './state/AppContext';
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

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
