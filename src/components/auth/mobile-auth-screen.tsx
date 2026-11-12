import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Bike,
  CheckCircle2,
  KeyRound,
  Lock,
  Phone,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Store,
  UserCheck,
} from 'lucide-react';
import {
  completeMobileRegistration,
  fetchNextBancaAllocation,
  formatAngolaPhoneInput,
  isValidAngolaMobile,
  type KitingoAuthenticatedUser,
  type MobileProfileRole,
  requestMobileOtp,
  resetMobilePinAfterOtp,
  signInWithMobilePin,
  verifyMobileOtp,
} from '../../lib/kitingo-auth.ts';

type MobileAuthFlowMode = 'register_otp' | 'login_pin' | 'recover_pin';
type MobileStep = 'phone_entry' | 'otp_verify' | 'profile_and_pin' | 'pin_recovery_reset' | 'authenticated';

interface MobileAuthScreenProps {
  activeCustomer?: KitingoAuthenticatedUser | null;
  onSessionAuthenticated?: (user: KitingoAuthenticatedUser) => void;
  onNavigateToBuyerStore?: () => void;
  onNavigateToMerchantDashboard?: () => void;
  onNavigateToDriverApp?: () => void;
  onNavigateToLogisticsApp?: () => void;
}

const PROFILE_TABS: Array<{
  id: MobileProfileRole;
  label: string;
  shortLabel: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'cliente',
    label: 'Cliente',
    shortLabel: 'Cliente',
    description: 'Compra peças auto com entrega em Luanda e Referência Multicaixa.',
    icon: Smartphone,
  },
  {
    id: 'vendedor',
    label: 'Vendedor da Banca',
    shortLabel: 'Vendedor da Banca',
    description: 'Regista banca oficial na Praça dos Correios com código único PC-XXX.',
    icon: Store,
  },
  {
    id: 'estafeta',
    label: 'Estafeta / Motorista',
    shortLabel: 'Estafeta / Motorista',
    description: 'App singular de recolha nas bancas, navegação GPS e entregas com PIN OTP.',
    icon: Bike,
  },
];

const PRAÇA_SECTORS = [
  'Bloco A · Travagem & Embraiagens',
  'Bloco B · Motor & Lubrificantes',
  'Bloco C · Filtros & Admissão',
  'Corredor Central · Suspensão & Direção',
  'Ala Norte · Pneus & Jantes',
  'Ala Sul · Eletrónica Auto & Baterias',
];

export function MobileAuthScreen({
  activeCustomer,
  onSessionAuthenticated,
  onNavigateToBuyerStore,
  onNavigateToMerchantDashboard,
  onNavigateToDriverApp,
  onNavigateToLogisticsApp,
}: MobileAuthScreenProps) {
  const openDriverApp = onNavigateToDriverApp || onNavigateToLogisticsApp;
  const [role, setRole] = useState<MobileProfileRole>('cliente');
  const [flowMode, setFlowMode] = useState<MobileAuthFlowMode>('register_otp');
  const [step, setStep] = useState<MobileStep>('phone_entry');

  // Phone & OTP state
  const [phoneInput, setPhoneInput] = useState('924 514 042');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [simulatedSmsCode, setSimulatedSmsCode] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [allocatedBancaCode, setAllocatedBancaCode] = useState('PC-042');

  // Registration & PIN state
  const [fullName, setFullName] = useState('');
  const [bancaName, setBancaName] = useState('');
  const [bancaSector, setBancaSector] = useState(PRAÇA_SECTORS[1]);
  const [nif, setNif] = useState('');
  const [vehicleType, setVehicleType] = useState('Motorizada 150cc · Caixa Térmica/Peças');
  const [vehiclePlate, setVehiclePlate] = useState('LD-48-29-AO');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  // Status & Session
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [authenticatedUser, setAuthenticatedUser] = useState<KitingoAuthenticatedUser | null>(null);

  useEffect(() => {
    loadBancaAllocation();
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  async function loadBancaAllocation() {
    try {
      const info = await fetchNextBancaAllocation();
      setAllocatedBancaCode(info.nextBancaCode);
    } catch {
      // Fallback if initial fetch is still warming up
    }
  }

  function handleRoleChange(nextRole: MobileProfileRole) {
    setRole(nextRole);
    if (nextRole === 'cliente') {
      setFlowMode('register_otp');
    }
    setErrorMessage(null);
    setStatusNotice(null);
    if (step !== 'phone_entry') {
      setStep('phone_entry');
    }
  }

  function handleFlowModeSwitch(nextMode: MobileAuthFlowMode) {
    setFlowMode(nextMode);
    setStep('phone_entry');
    setErrorMessage(null);
    setStatusNotice(null);
    setPin('');
    setConfirmPin('');
    setOtpDigits(['', '', '', '', '', '']);
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setStatusNotice(null);

    if (!isValidAngolaMobile(phoneInput)) {
      setErrorMessage('Número angolano inválido. Use 9 dígitos começando por 9 (ex: +244 923 456 789).');
      return;
    }

    setLoading(true);
    try {
      const channel = flowMode === 'recover_pin' ? 'pin_recovery' : 'sms_otp';
      const result = await requestMobileOtp({
        phone: phoneInput,
        role,
        channel,
      });
      setSimulatedSmsCode(result.simulatedSmsCode);
      setCountdown(result.expiresInSeconds);
      setOtpDigits(['', '', '', '', '', '']);
      setStep('otp_verify');
      setStatusNotice(
        `Código SMS enviado para ${result.phone}. Código gerado: ${result.simulatedSmsCode}`
      );
    } catch (err: any) {
      setErrorMessage(err.message || 'Falha ao enviar código SMS.');
    } finally {
      setLoading(false);
    }
  }

  function handleOtpDigitChange(index: number, value: string) {
    const clean = value.replace(/\D/g, '').slice(-1);
    const next = [...otpDigits];
    next[index] = clean;
    setOtpDigits(next);
    setErrorMessage(null);

    if (clean && index < 5) {
      const nextInput = document.getElementById(`kitingo-otp-${index + 1}`);
      nextInput?.focus();
    }
  }

  function fillOtpCode(codeStr: string) {
    const chars = codeStr.padEnd(6, '0').slice(0, 6).split('');
    setOtpDigits(chars);
    setErrorMessage(null);
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    const code = otpDigits.join('');

    if (code.length !== 6) {
      setErrorMessage('Introduza os 6 dígitos enviados por SMS para +244 ' + phoneInput + '.');
      return;
    }

    setLoading(true);
    try {
      const channel = flowMode === 'recover_pin' ? 'pin_recovery' : 'sms_otp';
      const res = await verifyMobileOtp({
        phone: phoneInput,
        code,
        channel,
      });

      if (res.allocatedBancaCode) {
        setAllocatedBancaCode(res.allocatedBancaCode);
      }

      if (flowMode === 'recover_pin') {
        setPin('');
        setConfirmPin('');
        setStep('pin_recovery_reset');
        setStatusNotice('Número confirmado por OTP. Defina agora o seu novo PIN de 4 dígitos.');
      } else {
        if (res.existingUser?.fullName) {
          setFullName(res.existingUser.fullName);
        }
        if (res.existingUser?.bancaName) {
          setBancaName(res.existingUser.bancaName);
        }
        setStep('profile_and_pin');
        setStatusNotice('Telefone +244 verificado com sucesso.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Código OTP inválido.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCompleteRegistration(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (role !== 'cliente') {
      if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        setErrorMessage('O PIN de acesso rápido deve conter exatamente 4 dígitos numéricos.');
        return;
      }
      if (pin !== confirmPin) {
        setErrorMessage('Os dois códigos PIN de 4 dígitos não coincidem.');
        return;
      }
    }

    setLoading(true);
    try {
      const res = await completeMobileRegistration({
        phone: phoneInput,
        fullName,
        role,
        pin: role === 'cliente' ? undefined : pin,
        bancaName: role === 'vendedor' ? bancaName : undefined,
        bancaSector: role === 'vendedor' ? bancaSector : undefined,
        nif: role === 'vendedor' ? nif : undefined,
        vehicleType: role === 'estafeta' ? vehicleType : undefined,
        vehiclePlate: role === 'estafeta' ? vehiclePlate : undefined,
      });

      setAuthenticatedUser(res.user);
      setStep('authenticated');
      await loadBancaAllocation();
      onSessionAuthenticated?.(res.user);
      if (res.user.role === 'cliente') {
        onNavigateToBuyerStore?.();
      } else if (res.user.role === 'vendedor') {
        onNavigateToMerchantDashboard?.();
      } else if (res.user.role === 'estafeta') {
        openDriverApp?.();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao guardar registo e PIN.');
    } finally {
      setLoading(false);
    }
  }

  async function handlePinLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (!isValidAngolaMobile(phoneInput)) {
      setErrorMessage('Informe um número móvel angolano válido (+244 9XX XXX XXX).');
      return;
    }
    if (pin.length !== 4) {
      setErrorMessage('Introduza o seu PIN de 4 dígitos.');
      return;
    }

    setLoading(true);
    try {
      const res = await signInWithMobilePin({
        phone: phoneInput,
        pin,
        role,
      });
      setAuthenticatedUser(res.user);
      setStep('authenticated');
      onSessionAuthenticated?.(res.user);
      if (res.user.role === 'cliente') {
        onNavigateToBuyerStore?.();
      } else if (res.user.role === 'vendedor') {
        onNavigateToMerchantDashboard?.();
      } else if (res.user.role === 'estafeta') {
        openDriverApp?.();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'PIN incorreto.');
    } finally {
      setLoading(false);
    }
  }

  async function handlePinRecoverySubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      setErrorMessage('O novo PIN deve conter exatamente 4 dígitos.');
      return;
    }
    if (pin !== confirmPin) {
      setErrorMessage('A confirmação do novo PIN não coincide.');
      return;
    }

    setLoading(true);
    try {
      const res = await resetMobilePinAfterOtp({
        phone: phoneInput,
        newPin: pin,
      });
      setAuthenticatedUser(res.user);
      setStep('authenticated');
      onSessionAuthenticated?.(res.user);
      if (res.user.role === 'cliente') {
        onNavigateToBuyerStore?.();
      } else if (res.user.role === 'vendedor') {
        onNavigateToMerchantDashboard?.();
      } else if (res.user.role === 'estafeta') {
        openDriverApp?.();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Não foi possível redefinir o PIN.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 lg:py-10">
      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
            {/* Mobile App Top Header */}
            <div className="bg-primary px-5 py-5 text-primary-foreground">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-brand-accent font-mono text-sm font-bold text-brand-accent-foreground">
                    KT
                  </span>
                  <div>
                    <h1 className="text-base font-bold tracking-tight">Kitingo Identidade</h1>
                    <p className="text-xs text-primary-foreground/75">
                      O Mercado dos Correios no Telemóvel
                    </p>
                  </div>
                </div>
                <span className="font-mono text-xs text-primary-foreground/80 tabular-nums">
                  AO · +244
                </span>
              </div>

              {/* Profile Toggle Tabs: [Cliente] | [Vendedor da Banca] | [Estafeta / Motorista] */}
              <div className="mt-4">
                <p className="mb-1.5 text-xs font-medium text-primary-foreground/80">
                  Selecione o seu perfil de acesso:
                </p>
                <div
                  role="tablist"
                  aria-label="Perfil de utilizador Kitingo"
                  className="grid grid-cols-3 gap-1 rounded-xl bg-white/10 p-1"
                >
                  {PROFILE_TABS.map((tab) => {
                    const Icon = tab.icon;
                    const active = role === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => handleRoleChange(tab.id)}
                        className={`flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-center transition-colors ${
                          active
                            ? 'bg-brand-accent font-semibold text-brand-accent-foreground shadow-xs'
                            : 'text-primary-foreground/80 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <Icon className="size-4 shrink-0" />
                        <span className="w-full truncate text-[11px] leading-tight whitespace-nowrap">
                          {tab.shortLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Secondary Auth Flow Mode Switcher (Only for Vendedor / Estafeta; Cliente uses One-Time Permanent Registration) */}
            {step !== 'authenticated' && role !== 'cliente' && (
              <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-2">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleFlowModeSwitch('register_otp')}
                    className={`min-h-[36px] rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                      flowMode === 'register_otp'
                        ? 'bg-card text-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Registo / SMS OTP
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFlowModeSwitch('login_pin')}
                    className={`min-h-[36px] rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                      flowMode === 'login_pin'
                        ? 'bg-card text-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Entrar com PIN
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFlowModeSwitch('recover_pin')}
                    className={`min-h-[36px] rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                      flowMode === 'recover_pin'
                        ? 'bg-card text-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Recuperar PIN
                  </button>
                </div>
              </div>
            )}

            {/* Main Form Body */}
            <div className="p-5">
              {/* Role Context Description + 1-Click Direct App Launcher */}
              <div className="mb-4 flex items-center justify-between gap-2 border-b border-border pb-3 text-xs text-muted-foreground">
                <div>
                  <span>
                    Perfil ativo:{' '}
                    <strong className="font-semibold text-foreground">
                      {PROFILE_TABS.find((t) => t.id === role)?.label}
                    </strong>
                  </span>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {PROFILE_TABS.find((t) => t.id === role)?.description}
                  </p>
                </div>

                {role === 'cliente' && onNavigateToBuyerStore && (
                  <button
                    type="button"
                    onClick={onNavigateToBuyerStore}
                    className="shrink-0 rounded-lg bg-[#16A34A] px-2.5 py-1.5 text-[11px] font-bold text-white hover:opacity-90 cursor-pointer"
                  >
                    Abrir App Comprador
                  </button>
                )}
                {role === 'vendedor' && onNavigateToMerchantDashboard && (
                  <button
                    type="button"
                    onClick={onNavigateToMerchantDashboard}
                    className="shrink-0 rounded-lg bg-[#16A34A] px-2.5 py-1.5 text-[11px] font-bold text-white hover:opacity-90 cursor-pointer"
                  >
                    Abrir Painel da Banca
                  </button>
                )}
                {role === 'estafeta' && openDriverApp && (
                  <button
                    type="button"
                    onClick={openDriverApp}
                    className="shrink-0 rounded-lg bg-[#16A34A] px-2.5 py-1.5 text-[11px] font-bold text-white hover:opacity-90 cursor-pointer"
                  >
                    Abrir App Estafeta
                  </button>
                )}
              </div>

              {/* One-Time Registration Notice & Instant Access for Cliente */}
              {role === 'cliente' && step !== 'authenticated' && (
                <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs">
                  <p className="font-semibold text-foreground">
                    Registo Único · Acesso Permanente
                  </p>
                  <p className="mt-0.5 text-muted-foreground">
                    O cliente regista-se uma única vez e entra diretamente na loja sempre que abrir
                    a aplicação, sem necessidade de autenticação constante.
                  </p>
                  {activeCustomer && activeCustomer.role === 'cliente' && (
                    <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-2.5">
                      <div>
                        <p className="text-[11px] text-muted-foreground">Sessão ativa neste telemóvel</p>
                        <p className="font-semibold text-foreground">{activeCustomer.fullName}</p>
                      </div>
                      <button
                        type="button"
                        onClick={onNavigateToBuyerStore}
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                      >
                        Entrar na Loja
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Automated Banca ID Generator Notice for Vendedor da Banca */}
              {role === 'vendedor' && step !== 'authenticated' && (
                <div className="mb-4 rounded-xl border border-amber-500/30 bg-accent p-3.5 text-accent-foreground">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        Gerador Automático de Banca · Praça dos Correios
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Para impedir bancas duplicadas no mercado, o sistema atribui um código
                        sequencial único validado na base de dados central:
                      </p>
                    </div>
                    <span className="shrink-0 rounded-lg bg-primary px-2.5 py-1 font-mono text-xs font-bold text-primary-foreground tabular-nums">
                      {allocatedBancaCode}
                    </span>
                  </div>
                </div>
              )}

              {/* Error Alert */}
              {errorMessage && (
                <div
                  role="alert"
                  className="mb-4 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold">Falha de validação</p>
                    <p className="mt-0.5">{errorMessage}</p>
                  </div>
                </div>
              )}

              {/* Status / OTP Notice */}
              {statusNotice && !errorMessage && (
                <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-emerald-600/25 bg-emerald-500/10 p-3 text-xs text-emerald-900">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-700" />
                  <div className="flex-1">
                    <p className="font-medium">{statusNotice}</p>
                  </div>
                </div>
              )}

              {/* STEP 1A: PHONE INPUT FOR OTP (REGISTER OR PIN RECOVERY) */}
              {step === 'phone_entry' && flowMode !== 'login_pin' && (
                <form onSubmit={handleSendOtp} className="flex flex-col gap-4">
                  <div>
                    <label
                      htmlFor="ao-phone-input"
                      className="mb-1.5 block text-xs font-semibold text-foreground"
                    >
                      Número de Telemóvel (Angola)
                    </label>
                    <div className="flex items-center overflow-hidden rounded-xl border border-input bg-background focus-within:ring-2 focus-within:ring-ring/40">
                      <span className="flex h-12 items-center gap-1.5 border-r border-border bg-muted px-3.5 font-mono text-sm font-semibold text-foreground select-none tabular-nums">
                        +244
                      </span>
                      <input
                        id="ao-phone-input"
                        type="tel"
                        inputMode="numeric"
                        value={phoneInput}
                        onChange={(e) => setPhoneInput(formatAngolaPhoneInput(e.target.value))}
                        placeholder="923 456 789"
                        className="h-12 w-full bg-transparent px-3.5 font-mono text-base font-medium text-foreground tabular-nums focus:outline-none"
                        required
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Operadoras suportadas: Unitel (92/93/94), Movicel (91/99) e Africell (95).
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-95 disabled:opacity-50"
                  >
                    <Phone className="size-4" />
                    <span>
                      {loading
                        ? 'A enviar código SMS...'
                        : flowMode === 'recover_pin'
                          ? 'Enviar SMS OTP para Recuperar PIN'
                          : 'Receber Código de Verificação (SMS OTP)'}
                    </span>
                  </button>
                </form>
              )}

              {/* STEP 1B: DIRECT 4-DIGIT PIN LOGIN */}
              {step === 'phone_entry' && flowMode === 'login_pin' && (
                <form onSubmit={handlePinLoginSubmit} className="flex flex-col gap-4">
                  <div>
                    <label
                      htmlFor="ao-pin-phone"
                      className="mb-1.5 block text-xs font-semibold text-foreground"
                    >
                      Telemóvel Registado (+244)
                    </label>
                    <div className="flex items-center overflow-hidden rounded-xl border border-input bg-background">
                      <span className="flex h-12 items-center border-r border-border bg-muted px-3.5 font-mono text-sm font-semibold text-foreground tabular-nums">
                        +244
                      </span>
                      <input
                        id="ao-pin-phone"
                        type="tel"
                        inputMode="numeric"
                        value={phoneInput}
                        onChange={(e) => setPhoneInput(formatAngolaPhoneInput(e.target.value))}
                        placeholder="924 514 014"
                        className="h-12 w-full bg-transparent px-3.5 font-mono text-base font-medium text-foreground tabular-nums focus:outline-none"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label htmlFor="login-pin-input" className="text-xs font-semibold text-foreground">
                        PIN de Segurança (4 dígitos)
                      </label>
                      <button
                        type="button"
                        onClick={() => handleFlowModeSwitch('recover_pin')}
                        className="text-xs font-medium text-primary underline underline-offset-2"
                      >
                        Esqueceu o PIN?
                      </button>
                    </div>
                    <input
                      id="login-pin-input"
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="••••"
                      className="h-12 w-full rounded-xl border border-input bg-background px-4 text-center font-mono text-xl tracking-[0.5em] text-foreground tabular-nums focus:outline-none focus:ring-2 focus:ring-ring/40"
                      required
                    />
                  </div>

                  {/* Quick demo credential helper for testing */}
                  <div className="rounded-xl border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">Contas de teste pré-registadas:</p>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setRole('vendedor');
                          setPhoneInput('924 514 014');
                          setPin('2440');
                        }}
                        className="rounded-lg border border-border bg-card px-2.5 py-1 font-mono text-[11px] text-foreground hover:bg-secondary"
                      >
                        Banca #PC-014 (+244 924 514 014 · PIN 2440)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRole('estafeta');
                          setPhoneInput('931 880 210');
                          setPin('8821');
                        }}
                        className="rounded-lg border border-border bg-card px-2.5 py-1 font-mono text-[11px] text-foreground hover:bg-secondary"
                      >
                        Estafeta (+244 931 880 210 · PIN 8821)
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-95 disabled:opacity-50"
                  >
                    <KeyRound className="size-4" />
                    <span>{loading ? 'A validar PIN...' : 'Entrar com PIN de 4 Dígitos'}</span>
                  </button>
                </form>
              )}

              {/* STEP 2: 6-DIGIT OTP VERIFICATION */}
              {step === 'otp_verify' && (
                <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setStep('phone_entry')}
                      className="inline-flex min-h-[36px] items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      <ArrowLeft className="size-3.5" />
                      <span>Alterar número (+244 {phoneInput})</span>
                    </button>
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                      Expira em {Math.floor(countdown / 60)}:
                      {String(countdown % 60).padStart(2, '0')}
                    </span>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-semibold text-foreground">
                      Código OTP de 6 dígitos enviado por SMS
                    </label>
                    <div className="grid grid-cols-6 gap-2">
                      {otpDigits.map((digit, idx) => (
                        <input
                          key={idx}
                          id={`kitingo-otp-${idx}`}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handleOtpDigitChange(idx, e.target.value)}
                          aria-label={`Dígito ${idx + 1} do código OTP`}
                          className="h-12 w-full rounded-xl border border-input bg-background text-center font-mono text-lg font-bold text-foreground tabular-nums focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/40"
                        />
                      ))}
                    </div>
                  </div>

                  {/* Interactive OTP Testing Bar (Fill Valid vs Test Invalid OTP) */}
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/50 p-3 text-xs">
                    <div className="font-mono text-foreground tabular-nums">
                      SMS Simulado: <strong>{simulatedSmsCode || '------'}</strong>
                    </div>
                    <div className="flex items-center gap-2">
                      {simulatedSmsCode && (
                        <button
                          type="button"
                          onClick={() => fillOtpCode(simulatedSmsCode)}
                          className="rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                        >
                          Preencher OTP Correto
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => fillOtpCode('000000')}
                        className="rounded-lg border border-destructive/40 bg-card px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                      >
                        Testar OTP Inválido
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-95 disabled:opacity-50"
                    >
                      <ShieldCheck className="size-4" />
                      <span>{loading ? 'A verificar OTP...' : 'Confirmar Código OTP'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={handleSendOtp}
                      title="Reenviar código SMS"
                      className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3.5 text-xs font-medium text-foreground hover:bg-secondary"
                    >
                      <RefreshCw className="size-4" />
                      <span>Reenviar</span>
                    </button>
                  </div>
                </form>
              )}

              {/* STEP 3: PROFILE DETAILS + AUTOMATED BANCA ID + 4-DIGIT PIN SETUP */}
              {step === 'profile_and_pin' && (
                <form onSubmit={handleCompleteRegistration} className="flex flex-col gap-4">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-foreground">
                      Nome Completo do Titular
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Ex: João Manuel Baptista"
                      className="h-11 w-full rounded-xl border border-input bg-background px-3.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                      required
                    />
                  </div>

                  {role === 'vendedor' && (
                    <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-3.5">
                      <div className="flex items-center justify-between border-b border-border pb-2">
                        <span className="text-xs font-semibold text-foreground">
                          Identificador Oficial Atribuído
                        </span>
                        <span className="font-mono text-sm font-bold text-primary tabular-nums">
                          {allocatedBancaCode}
                        </span>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-foreground">
                          Nome Comercial da Banca
                        </label>
                        <input
                          type="text"
                          value={bancaName}
                          onChange={(e) => setBancaName(e.target.value)}
                          placeholder="Ex: Auto Peças Kitingo Sul"
                          className="h-11 w-full rounded-xl border border-input bg-card px-3.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                          required
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-foreground">
                            Sector na Praça dos Correios
                          </label>
                          <select
                            value={bancaSector}
                            onChange={(e) => setBancaSector(e.target.value)}
                            className="h-11 w-full rounded-xl border border-input bg-card px-3 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                          >
                            {PRAÇA_SECTORS.map((sector) => (
                              <option key={sector} value={sector}>
                                {sector}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-foreground">
                            NIF / Bilhete de Identidade
                          </label>
                          <input
                            type="text"
                            value={nif}
                            onChange={(e) => setNif(e.target.value)}
                            placeholder="Ex: 5417200988"
                            className="h-11 w-full rounded-xl border border-input bg-card px-3 text-sm font-mono text-foreground tabular-nums focus:outline-none focus:ring-2 focus:ring-ring/40"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {role === 'estafeta' && (
                    <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-muted/40 p-3.5 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-foreground">
                          Meio de Transporte
                        </label>
                        <input
                          type="text"
                          value={vehicleType}
                          onChange={(e) => setVehicleType(e.target.value)}
                          className="h-11 w-full rounded-xl border border-input bg-card px-3 text-xs text-foreground"
                          required
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-foreground">
                          Matrícula (Luanda)
                        </label>
                        <input
                          type="text"
                          value={vehiclePlate}
                          onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
                          placeholder="LD-00-00-AO"
                          className="h-11 w-full rounded-xl border border-input bg-card px-3 font-mono text-xs text-foreground tabular-nums"
                          required
                        />
                      </div>
                    </div>
                  )}

                  {/* 4-Digit PIN Setup (Only required for Vendedor & Estafeta) */}
                  {role !== 'cliente' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-foreground">
                          Criar PIN (4 dígitos)
                        </label>
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={4}
                          value={pin}
                          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          placeholder="••••"
                          className="h-11 w-full rounded-xl border border-input bg-background px-3 text-center font-mono text-lg tracking-[0.4em] text-foreground tabular-nums focus:outline-none focus:ring-2 focus:ring-ring/40"
                          required
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-foreground">
                          Confirmar PIN
                        </label>
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={4}
                          value={confirmPin}
                          onChange={(e) =>
                            setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                          }
                          placeholder="••••"
                          className="h-11 w-full rounded-xl border border-input bg-background px-3 text-center font-mono text-lg tracking-[0.4em] text-foreground tabular-nums focus:outline-none focus:ring-2 focus:ring-ring/40"
                          required
                        />
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-95 disabled:opacity-50"
                  >
                    <Lock className="size-4" />
                    <span>
                      {loading
                        ? 'A concluir registo...'
                        : role === 'vendedor'
                          ? `Ativar Banca ${allocatedBancaCode} e Guardar PIN`
                          : role === 'cliente'
                            ? 'Concluir Registo Único e Entrar na Loja'
                            : 'Concluir Registo e Ativar PIN'}
                    </span>
                  </button>
                </form>
              )}

              {/* STEP 3B: PIN RECOVERY RESET */}
              {step === 'pin_recovery_reset' && (
                <form onSubmit={handlePinRecoverySubmit} className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-foreground">
                        Novo PIN (4 dígitos)
                      </label>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        placeholder="••••"
                        className="h-11 w-full rounded-xl border border-input bg-background px-3 text-center font-mono text-lg tracking-[0.4em] text-foreground tabular-nums"
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-foreground">
                        Confirmar Novo PIN
                      </label>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        value={confirmPin}
                        onChange={(e) =>
                          setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                        }
                        placeholder="••••"
                        className="h-11 w-full rounded-xl border border-input bg-background px-3 text-center font-mono text-lg tracking-[0.4em] text-foreground tabular-nums"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
                  >
                    <KeyRound className="size-4" />
                    <span>{loading ? 'A atualizar PIN...' : 'Guardar Novo PIN de 4 Dígitos'}</span>
                  </button>
                </form>
              )}

              {/* STEP 4: AUTHENTICATED MOBILE IDENTITY CARD */}
              {step === 'authenticated' && authenticatedUser && (
                <div className="flex flex-col gap-4">
                  <div className="rounded-2xl border border-emerald-600/30 bg-emerald-500/10 p-4">
                    <div className="flex items-center gap-3">
                      <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-700 text-white">
                        <UserCheck className="size-5" />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-emerald-900">
                          Sessão Móvel Autenticada · PIN & OTP Ativos
                        </p>
                        <h2 className="text-base font-bold text-foreground">
                          {authenticatedUser.fullName}
                        </h2>
                      </div>
                    </div>

                    <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-emerald-600/20 pt-3 text-xs">
                      <div>
                        <dt className="text-muted-foreground">Telemóvel</dt>
                        <dd className="font-mono font-semibold text-foreground tabular-nums">
                          {authenticatedUser.phone}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Perfil Kitingo</dt>
                        <dd className="font-semibold capitalize text-foreground">
                          {authenticatedUser.role}
                        </dd>
                      </div>
                      {authenticatedUser.bancaCode && (
                        <div className="col-span-2 mt-1 rounded-lg bg-card p-2.5">
                          <dt className="text-muted-foreground">Banca Registada na Praça dos Correios</dt>
                          <dd className="mt-0.5 flex items-center justify-between font-semibold text-foreground">
                            <span>{authenticatedUser.bancaName || 'Banca Oficial'}</span>
                            <span className="font-mono text-sm font-bold text-primary tabular-nums">
                              {authenticatedUser.bancaCode}
                            </span>
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>

                  <div className="flex items-center gap-2">
                    {authenticatedUser.role === 'cliente' && onNavigateToBuyerStore && (
                      <button
                        type="button"
                        onClick={onNavigateToBuyerStore}
                        className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground"
                      >
                        Abrir Loja do Comprador
                      </button>
                    )}
                    {authenticatedUser.role === 'vendedor' && onNavigateToMerchantDashboard && (
                      <button
                        type="button"
                        onClick={onNavigateToMerchantDashboard}
                        className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground"
                      >
                        Abrir Painel da Banca
                      </button>
                    )}
                    {authenticatedUser.role === 'estafeta' && openDriverApp && (
                      <button
                        type="button"
                        onClick={openDriverApp}
                        className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground"
                      >
                        Abrir App do Estafeta
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setAuthenticatedUser(null);
                        setStep('phone_entry');
                        setPin('');
                        setConfirmPin('');
                      }}
                      className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-border bg-card px-4 text-xs font-semibold text-foreground hover:bg-secondary"
                    >
                      Terminar Sessão / Testar Outro Perfil
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
    </div>
  );
}
