
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { LockKeyhole, ShieldCheck, LogIn, LoaderCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

export type Profile = {
  user_id: string;
  full_name: string | null;
  role: 'OWNER' | 'ADMIN';
  active: boolean;
};

type AuthGateProps = {
  children: (profile: Profile, logout: () => Promise<void>) => ReactNode;
};

export default function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let alive = true;

    const loadProfile = async (current: Session | null) => {
      if (!alive) return;

      setSession(current);
      setProfile(null);
      setError('');

      if (!current) {
        setChecked(true);
        setLoading(false);
        return;
      }

      const { data, error: profileError } = await supabase
        .from('app_users')
        .select('user_id, full_name, role, active')
        .eq('user_id', current.user.id)
        .maybeSingle();

      if (!alive) return;

      if (profileError || !data || !data.active) {
        await supabase.auth.signOut();
        if (!alive) return;

        setSession(null);
        setProfile(null);
        setError(
          profileError
            ? 'Não foi possível validar seu acesso. Tente novamente.'
            : 'Seu usuário não está autorizado ou está inativo.'
        );
        setChecked(true);
        setLoading(false);
        return;
      }

      if (data.role !== 'OWNER' && data.role !== 'ADMIN') {
        await supabase.auth.signOut();
        if (!alive) return;

        setSession(null);
        setProfile(null);
        setError('Seu perfil não possui uma função autorizada.');
        setChecked(true);
        setLoading(false);
        return;
      }

      setProfile(data as Profile);
      setChecked(true);
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data }) => {
      void loadProfile(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!alive) return;
        if (!newSession) {
          setSession(null);
          setProfile(null);
          setLoading(false);
          setChecked(true);
        } else {
          // Evita consultas ao Supabase diretamente dentro do callback de auth.
          setSession(newSession);
        }
      }
    );

    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }

    let alive = true;

    const validate = async () => {
      const { data, error: profileError } = await supabase
        .from('app_users')
        .select('user_id, full_name, role, active')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (!alive) return;

      if (
        profileError ||
        !data ||
        !data.active ||
        (data.role !== 'OWNER' && data.role !== 'ADMIN')
      ) {
        await supabase.auth.signOut();
        if (!alive) return;
        setSession(null);
        setProfile(null);
        setError('Não foi possível validar seu acesso ao Pedidos PRO.');
        setLoading(false);
        setChecked(true);
        return;
      }

      setProfile(data as Profile);
      setLoading(false);
      setChecked(true);
    };

    void validate();

    return () => {
      alive = false;
    };
  }, [session?.user.id]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (loginError) {
        setError('E-mail ou senha inválidos. Confira os dados e tente novamente.');
      }
    } catch {
      setError('Não foi possível entrar agora. Verifique sua conexão e tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    const { error: logoutError } = await supabase.auth.signOut();

    if (logoutError) {
      setError('Não foi possível encerrar a sessão. Tente novamente.');
    }
  }

  if (loading || !checked) {
    return (
      <div className="auth-screen">
        <div className="auth-card auth-loading">
          <LoaderCircle className="auth-spinner" size={30} />
          <p>Verificando acesso...</p>
        </div>
      </div>
    );
  }

  if (session && profile) {
    return <>{children(profile, logout)}</>;
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand-icon">
          <ShieldCheck size={29} />
        </div>

        <div className="auth-eyebrow">CONTROLE OPERACIONAL</div>
        <h1>Pedidos<span>PRO</span></h1>
        <p className="auth-description">
          Entre para acompanhar pedidos, produção, inspeções e entregas.
        </p>

        <form className="auth-form" onSubmit={login}>
          <label htmlFor="login-email">E-mail</label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            placeholder="seu@email.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label htmlFor="login-password">Senha</label>
          <div className="auth-password">
            <LockKeyhole size={17} />
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              placeholder="Digite sua senha"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {error && <div className="auth-error" role="alert">{error}</div>}

          <button className="primary-btn auth-submit" disabled={submitting}>
            {submitting ? (
              <LoaderCircle className="auth-spinner" size={18} />
            ) : (
              <LogIn size={18} />
            )}
            {submitting ? 'Entrando...' : 'Entrar no sistema'}
          </button>
        </form>

        <div className="auth-security">
          <ShieldCheck size={17} />
          <span>Acesso restrito a usuários autorizados</span>
        </div>
      </div>
    </div>
  );
}
