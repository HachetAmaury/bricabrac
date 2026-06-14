import { useState } from 'react';
import { AppProvider } from './state/AppContext';
import { TabBar, type TabId } from './components/TabBar';
import { CatalogView } from './views/CatalogView';
import { EventsView } from './views/EventsView';
import { ReportView } from './views/ReportView';
import { SellView } from './views/SellView';
import { CashView } from './views/CashView';

function Shell() {
  const [tab, setTab] = useState<TabId>('events');
  return (
    <div style={{ minHeight: '100%', paddingBottom: 'calc(var(--tab-height) + 16px)' }}>
      {tab === 'events' && <EventsView />}
      {tab === 'sell' && <SellView />}
      {tab === 'report' && <ReportView />}
      {tab === 'cash' && <CashView />}
      {tab === 'catalog' && <CatalogView />}
      <TabBar active={tab} onSelect={setTab} />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
