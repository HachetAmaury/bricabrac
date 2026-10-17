import { Modal } from './Modal';
import { Button } from './ui/Button';
import { formatCents } from '../lib/money';
import { downloadJSON } from '../lib/download';
import type { RejectedSale, RejectReason } from '../sync/outbox';

const REASONS: Record<RejectReason, string> = {
  'event-deleted': 'événement supprimé',
  'not-member': 'accès retiré',
  disabled: 'compte désactivé',
  'unknown-version': 'format inconnu',
  'server-error': 'erreur serveur'
};

const time = (ms: number) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** Saves `sales` as the dated JSON export offered by the dialog. */
export function exportRejectedSales(sales: RejectedSale[]): void {
  downloadJSON({ rejectedSales: sales }, `ventes-non-synchronisees-${new Date().toISOString().slice(0, 10)}.json`);
}

/**
 * Sales the server refused for good (or that can no longer be sent). Stays
 * open until OK: closing it by the backdrop would let a refused sale go
 * unnoticed.
 */
export function RejectedSalesDialog({
  sales,
  onDismiss,
  onExport
}: {
  sales: RejectedSale[];
  onDismiss: () => void;
  onExport: () => void;
}) {
  return (
    <Modal open={sales.length > 0} onClose={() => {}} title="Ventes non synchronisées">
      <ul style={{ listStyle: 'none', margin: '0 0 16px', padding: 0 }}>
        {sales.map((r) => (
          <li
            key={r.opId}
            style={{ padding: '8px 0', borderBottom: '0.5px solid var(--separator-opaque)', fontSize: 16 }}
          >
            {r.kind === 'deleteSale'
              ? `${time(r.rejectedAt)} · annulation · ${REASONS[r.reason]}`
              : `${time(r.sale.timestamp)} · ${formatCents(r.sale.total)} · ${REASONS[r.reason]}`}
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Button variant="gray" size="lg" onClick={onExport}>
          Exporter en JSON
        </Button>
        <Button variant="filled" size="lg" onClick={onDismiss}>
          OK
        </Button>
      </div>
    </Modal>
  );
}
