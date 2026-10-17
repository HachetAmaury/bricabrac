import { useState, type CSSProperties, type FormEvent } from 'react';
import { ChromeProvider } from '../components/ui/chrome';
import { NavBar } from '../components/ui/NavBar';
import { Button } from '../components/ui/Button';
import { RejectedSalesDialog, exportRejectedSales } from '../components/RejectedSalesDialog';
import { useAuth } from '../state/AuthContext';
import { hasSupabaseConfig } from '../lib/supabase';

const labelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 15,
  color: 'var(--label-secondary)'
};
const inputStyle: CSSProperties = {
  minHeight: 44,
  padding: '0 12px',
  fontSize: 17,
  borderRadius: 10,
  border: '0.5px solid var(--separator)',
  background: 'var(--fill)',
  color: 'var(--label)'
};

export function LoginView() {
  const { signIn, lastError, strandedSales, dismissStranded } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(lastError);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await signIn(email.trim(), password);
    setError(result);
    setPending(false);
  }

  return (
    // NavBar needs the chrome context; there is no menu before login.
    <ChromeProvider openMenu={() => {}}>
      <NavBar title="Connexion" />
      <form
        onSubmit={onSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 16px' }}
      >
        <label style={labelStyle}>
          Email
          <input
            type="email"
            autoCapitalize="none"
            autoCorrect="off"
            inputMode="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          Mot de passe
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
        </label>
        {error && (
          <p role="alert" style={{ color: 'var(--ios-red)', fontSize: 15, margin: 0 }}>
            {error}
          </p>
        )}
        <Button type="submit" variant="filled" size="lg" disabled={pending}>
          Se connecter
        </Button>
        {!hasSupabaseConfig() && (
          <p style={{ color: 'var(--label-secondary)', fontSize: 13, margin: 0 }}>
            Configuration Supabase manquante.
          </p>
        )}
      </form>
      {/* Sales a dead session left unsent: listed with an export before anything else. */}
      <RejectedSalesDialog
        sales={strandedSales}
        onDismiss={dismissStranded}
        onExport={() => exportRejectedSales(strandedSales)}
      />
    </ChromeProvider>
  );
}
