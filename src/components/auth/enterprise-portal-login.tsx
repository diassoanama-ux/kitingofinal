import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Lock,
  Mail,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  type AuthAuditLogItem,
  type EnterpriseRole,
  fetchIdentityDirectory,
  initiateEnterpriseLogin,
  type KitingoAuthenticatedUser,
  signInEnterpriseWithGoogleSso,
  verifyEnterpriseTwoFactor,
} from '../../lib/kitingo-auth.ts';

interface EnterprisePortalLoginProps {
  onEnterpriseAuthenticated?: (user: KitingoAuthenticatedUser) => void;
  onNavigateToLogisticsPartner?: () => void;
  onNavigateToAdminBackoffice?: (role?: 'super_admin' | 'field_supervisor' | 'call_center') => void;
}

const ENTERPRISE_ROLES: Array<{
  id: EnterpriseRole;
  title: string;
  scope: string;
  demoEmail: string;
}> = [
  {
    id: 'admin',
    title: 'Super Admin',
    scope: 'Controlo total RBAC, Reprocessamento Splits BAI/BCI, Exportação AGT e Torre GPS.',
    demoEmail: 'admin@kitingo.ao',
  },
  {
    id: 'supervisor',
    title: 'Supervisor de Campo',
    scope: 'Torre de Controlo GPS Luanda, Homologação de Bancas PC-XXX e Bloqueio de Fraude.',
    demoEmail: 'supervisor@kitingo.ao',
  },
  {
    id: 'suporte',
    title: 'Assistente Call Center',
    scope: 'Identificação +244, Tickets de Suporte e Inspeção Split-View Match por Amostra.',
    demoEmail: 'suporte@kitingo.ao',
  },
];

export function EnterprisePortalLogin({
  onEnterpriseAuthenticated,
  onNavigateToLogisticsPartner,
  onNavigateToAdminBackoffice,
}: EnterprisePortalLoginProps) {
  const [selectedRole, setSelectedRole] = useState<EnterpriseRole>('admin');
  const [email, setEmail] = useState('admin@kitingo.ao');
  const [password, setPassword] = useState('Kitingo@2026');
  const [stage, setStage] = useState<'credentials' | 'two_factor' | 'authenticated'>('credentials');

  // 2FA state
  const [twoFactorDigits, setTwoFactorDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [simulated2FACode, setSimulated2FACode] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  // Directory & Audit state
  const [recentAudits, setRecentAudits] = useState<AuthAuditLogItem[]>([]);
  const [totalAccounts, setTotalAccounts] = useState(0);
  const [totalBancas, setTotalBancas] = useState(0);

  // Feedback state
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [authenticatedStaff, setAuthenticatedStaff] = useState<KitingoAuthenticatedUser | null>(
    null
  );

  useEffect(() => {
    refreshDirectoryStats();
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  async function refreshDirectoryStats() {
    try {
      const dir = await fetchIdentityDirectory();
      setRecentAudits(dir.recentAudits);
      setTotalAccounts(dir.users.length);
      setTotalBancas(dir.bancas.length);
    } catch {
      // Non-blocking
    }
  }

  function handleSelectEnterpriseRole(nextRole: EnterpriseRole) {
    setSelectedRole(nextRole);
    const preset = ENTERPRISE_ROLES.find((r) => r.id === nextRole);
    if (preset) {
      setEmail(preset.demoEmail);
    }
    setErrorMessage(null);
  }

  async function handlePrimaryCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    try {
      const res = await initiateEnterpriseLogin({
        email,
        password,
        role: selectedRole,
      });
      setSimulated2FACode(res.simulated2FACode);
      setCountdown(res.expiresInSeconds);
      setTwoFactorDigits(['', '', '', '', '', '']);
      setStage('two_factor');
      await refreshDirectoryStats();
    } catch (err: any) {
      setErrorMessage(err.message || 'Credenciais corporativas inválidas.');
      await refreshDirectoryStats();
    } finally {
      setLoading(false);
    }
  }

  function handle2FADigitChange(index: number, value: string) {
    const clean = value.replace(/\D/g, '').slice(-1);
    const next = [...twoFactorDigits];
    next[index] = clean;
    setTwoFactorDigits(next);
    setErrorMessage(null);

    if (clean && index < 5) {
      const nextInput = document.getElementById(`kitingo-2fa-${index + 1}`);
      nextInput?.focus();
    }
  }

  function fill2FACode(codeStr: string) {
    const chars = codeStr.padEnd(6, '0').slice(0, 6).split('');
    setTwoFactorDigits(chars);
    setErrorMessage(null);
  }

  async function handleVerify2FASubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    const code = twoFactorDigits.join('');

    if (code.length !== 6) {
      setErrorMessage('Introduza os 6 dígitos do desafio 2FA.');
      return;
    }

    setLoading(true);
    try {
      const res = await verifyEnterpriseTwoFactor({
        email,
        code,
      });
      setAuthenticatedStaff(res.user);
      setStage('authenticated');
      await refreshDirectoryStats();
      onEnterpriseAuthenticated?.(res.user);
    } catch (err: any) {
      setErrorMessage(err.message || 'Código 2FA incorreto.');
      await refreshDirectoryStats();
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSsoLogin() {
    setErrorMessage(null);
    setLoading(true);
    try {
      const syncedUser = await signInEnterpriseWithGoogleSso(selectedRole);
      setAuthenticatedStaff(syncedUser);
      setStage('authenticated');
      await refreshDirectoryStats();
      onEnterpriseAuthenticated?.(syncedUser);
    } catch (err: any) {
      setErrorMessage(
        err.message || 'Não foi possível concluir a autenticação Google SSO corporativa.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 lg:py-10">
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        {/* Left Column: Enterprise Portal Login & 2FA Challenge Card */}
        <div className="lg:col-span-6">
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
            {/* Enterprise Header */}
            <div className="border-b border-border bg-primary px-6 py-5 text-primary-foreground">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-brand-accent font-mono text-sm font-bold text-brand-accent-foreground">
                    KT
                  </span>
                  <div>
                    <h1 className="text-base font-bold tracking-tight">
                      Kitingo Enterprise Portal
                    </h1>
                    <p className="text-xs text-primary-foreground/75">
                      Consola Administrativa · Supervisão & Suporte
                    </p>
                  </div>
                </div>
                <span className="font-mono text-xs text-primary-foreground/80 tabular-nums">
                  2FA Obrigatório
                </span>
              </div>
            </div>

            <div className="p-6">
              {/* Role Selector: Admin | Supervisor | Support */}
              {stage === 'credentials' && (
                <div className="mb-5">
                  <label className="mb-2 block text-xs font-semibold text-foreground">
                    Nível de Credencial Corporativa
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {ENTERPRISE_ROLES.map((item) => {
                      const active = selectedRole === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSelectEnterpriseRole(item.id)}
                          className={`flex min-h-[44px] flex-col items-start justify-center rounded-xl border p-2.5 text-left transition-colors ${
                            active
                              ? 'border-primary bg-primary/5 text-foreground'
                              : 'border-border bg-background text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <span className="text-xs font-semibold whitespace-nowrap">
                            {item.title}
                          </span>
                          <span className="mt-0.5 truncate w-full font-mono text-[10px] text-muted-foreground">
                            {item.demoEmail}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {ENTERPRISE_ROLES.find((r) => r.id === selectedRole)?.scope}
                  </p>
                </div>
              )}

              {/* Error Banner */}
              {errorMessage && (
                <div
                  role="alert"
                  className="mb-4 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold">Alerta de Segurança</p>
                    <p className="mt-0.5">{errorMessage}</p>
                  </div>
                </div>
              )}

              {/* STAGE 1: EMAIL & PASSWORD FORM */}
              {stage === 'credentials' && (
                <form onSubmit={handlePrimaryCredentialsSubmit} className="flex flex-col gap-4">
                  <div>
                    <label
                      htmlFor="ent-email"
                      className="mb-1.5 block text-xs font-semibold text-foreground"
                    >
                      Email Institucional
                    </label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        id="ent-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="nome@kitingo.ao"
                        className="h-11 w-full rounded-xl border border-input bg-background pr-4 pl-10 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label
                        htmlFor="ent-password"
                        className="text-xs font-semibold text-foreground"
                      >
                        Palavra-passe Corporativa
                      </label>
                      <button
                        type="button"
                        onClick={() => setPassword('wrongpass')}
                        className="text-[11px] font-medium text-muted-foreground hover:text-destructive"
                      >
                        Simular Palavra-passe Errada
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        id="ent-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="h-11 w-full rounded-xl border border-input bg-background pr-4 pl-10 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-95 disabled:opacity-50"
                  >
                    <Shield className="size-4" />
                    <span>
                      {loading ? 'A validar credenciais...' : 'Continuar para Desafio 2FA'}
                    </span>
                  </button>

                  <div className="relative my-1 flex items-center justify-center">
                    <div className="w-full border-t border-border" />
                    <span className="bg-card px-3 text-[11px] text-muted-foreground whitespace-nowrap">
                      ou federação corporativa
                    </span>
                    <div className="w-full border-t border-border" />
                  </div>

                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleGoogleSsoLogin}
                    className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-50"
                  >
                    <KeyRound className="size-4 text-primary" />
                    <span>Autenticar com Google Workspace SSO</span>
                  </button>

                  {onNavigateToAdminBackoffice && (
                    <button
                      type="button"
                      onClick={() =>
                        onNavigateToAdminBackoffice(
                          selectedRole === 'supervisor'
                            ? 'field_supervisor'
                            : selectedRole === 'suporte'
                              ? 'call_center'
                              : 'super_admin'
                        )
                      }
                      className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 cursor-pointer"
                    >
                      <span>
                        Abrir Back-Office & Torre de Controlo ({ENTERPRISE_ROLES.find((r) => r.id === selectedRole)?.title})
                      </span>
                    </button>
                  )}

                  {onNavigateToLogisticsPartner && (
                    <button
                      type="button"
                      onClick={onNavigateToLogisticsPartner}
                      className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#16A34A] px-4 py-2 text-xs font-bold text-white hover:opacity-90 cursor-pointer"
                    >
                      <span>Abrir Painel da Empresa de Estafetas (Logística)</span>
                    </button>
                  )}
                </form>
              )}

              {/* STAGE 2: 2FA CHALLENGE SCREEN */}
              {stage === 'two_factor' && (
                <form onSubmit={handleVerify2FASubmit} className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setStage('credentials');
                        setErrorMessage(null);
                      }}
                      className="inline-flex min-h-[36px] items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      <ArrowLeft className="size-3.5" />
                      <span>Voltar às credenciais</span>
                    </button>
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                      Expira em {Math.floor(countdown / 60)}:
                      {String(countdown % 60).padStart(2, '0')}
                    </span>
                  </div>

                  <div className="rounded-xl border border-border bg-muted/40 p-3.5">
                    <p className="text-xs font-semibold text-foreground">
                      Desafio de Segundo Fator (2FA) · {email}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Introduza o código de 6 dígitos do seu autenticador corporativo para
                      desbloquear a consola de{' '}
                      <strong className="font-semibold text-foreground">
                        {ENTERPRISE_ROLES.find((r) => r.id === selectedRole)?.title}
                      </strong>
                      .
                    </p>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold text-foreground">
                      Código de Segurança 2FA (6 dígitos)
                    </label>
                    <div className="grid grid-cols-6 gap-2">
                      {twoFactorDigits.map((digit, idx) => (
                        <input
                          key={idx}
                          id={`kitingo-2fa-${idx}`}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handle2FADigitChange(idx, e.target.value)}
                          aria-label={`Dígito ${idx + 1} do código 2FA`}
                          className="h-12 w-full rounded-xl border border-input bg-background text-center font-mono text-lg font-bold text-foreground tabular-nums focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/40"
                        />
                      ))}
                    </div>
                  </div>

                  {/* Interactive 2FA Testing Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/50 p-3 text-xs">
                    <div className="font-mono text-foreground tabular-nums">
                      Token 2FA Ativo: <strong>{simulated2FACode || '------'}</strong>
                    </div>
                    <div className="flex items-center gap-2">
                      {simulated2FACode && (
                        <button
                          type="button"
                          onClick={() => fill2FACode(simulated2FACode)}
                          className="rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                        >
                          Usar Token 2FA
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => fill2FACode('999999')}
                        className="rounded-lg border border-destructive/40 bg-card px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                      >
                        Testar 2FA Inválido
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-95 disabled:opacity-50"
                    >
                      <ShieldCheck className="size-4" />
                      <span>{loading ? 'A verificar 2FA...' : 'Confirmar Desafio 2FA'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={handlePrimaryCredentialsSubmit}
                      className="flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3.5 text-xs font-medium text-foreground hover:bg-secondary"
                    >
                      <RefreshCw className="size-4" />
                      <span>Novo Token</span>
                    </button>
                  </div>
                </form>
              )}

              {/* STAGE 3: AUTHENTICATED ENTERPRISE SESSION */}
              {stage === 'authenticated' && authenticatedStaff && (
                <div className="flex flex-col gap-4">
                  <div className="rounded-2xl border border-emerald-600/30 bg-emerald-500/10 p-4">
                    <div className="flex items-center gap-3">
                      <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-700 text-white">
                        <CheckCircle2 className="size-5" />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-emerald-900">
                          Sessão Corporativa Verificada · 2FA Confirmado
                        </p>
                        <h2 className="text-base font-bold text-foreground">
                          {authenticatedStaff.fullName || authenticatedStaff.email}
                        </h2>
                      </div>
                    </div>

                    <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-emerald-600/20 pt-3 text-xs">
                      <div>
                        <dt className="text-muted-foreground">Email Institucional</dt>
                        <dd className="font-mono font-semibold text-foreground">
                          {authenticatedStaff.email}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Função / Permissão</dt>
                        <dd className="font-semibold uppercase text-foreground">
                          {authenticatedStaff.role}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    {onNavigateToLogisticsPartner && (
                      <button
                        type="button"
                        onClick={onNavigateToLogisticsPartner}
                        className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-[#16A34A] px-4 text-xs font-bold text-white hover:opacity-90 cursor-pointer"
                      >
                        Abrir Painel Logística (Frota)
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setAuthenticatedStaff(null);
                        setStage('credentials');
                        setTwoFactorDigits(['', '', '', '', '', '']);
                      }}
                      className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-border bg-card px-4 text-xs font-semibold text-foreground hover:bg-secondary cursor-pointer"
                    >
                      Encerrar Sessão Corporativa
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Live Security Audit Log & Identity Metrics */}
        <div className="flex flex-col gap-5 lg:col-span-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Contas Identidade Ativas</span>
                <Users className="size-4 text-primary" />
              </div>
              <p className="mt-2 font-mono text-2xl font-bold text-foreground tabular-nums">
                {totalAccounts}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Clientes, Vendedores, Estafetas & Staff
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Bancas Homologadas (PC-XXX)</span>
                <ShieldAlert className="size-4 text-primary" />
              </div>
              <p className="mt-2 font-mono text-2xl font-bold text-foreground tabular-nums">
                {totalBancas}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Praça dos Correios · Luanda
              </p>
            </div>
          </div>

          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h2 className="text-sm font-bold text-foreground">
                  Registo de Auditoria de Autenticação (Tempo Real)
                </h2>
                <p className="text-xs text-muted-foreground">
                  Eventos de OTP, PIN e 2FA registados na base de dados
                </p>
              </div>
              <button
                type="button"
                onClick={refreshDirectoryStats}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-secondary"
              >
                <RefreshCw className="size-3.5" />
                <span>Atualizar</span>
              </button>
            </div>

            {recentAudits.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                Ainda não existem eventos registados nesta sessão.
              </p>
            ) : (
              <div className="mt-3 max-h-80 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="pb-2 font-medium">Evento</th>
                      <th className="pb-2 font-medium">Identificador</th>
                      <th className="pb-2 text-right font-medium">Portal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {recentAudits.map((log) => {
                      const isFailure =
                        log.eventType.includes('FAILED') || log.eventType.includes('EXPIRED');
                      return (
                        <tr key={log.id} className="hover:bg-muted/40">
                          <td
                            className={`py-2.5 font-mono text-[11px] font-semibold ${
                              isFailure ? 'text-destructive' : 'text-foreground'
                            }`}
                          >
                            {log.eventType}
                          </td>
                          <td className="py-2.5 font-mono text-muted-foreground tabular-nums">
                            {log.actorIdentifier}
                          </td>
                          <td className="py-2.5 text-right capitalize text-muted-foreground">
                            {log.portal}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
