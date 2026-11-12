import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleAuthProvider } from './firebase.ts';

export type MobileProfileRole = 'cliente' | 'vendedor' | 'estafeta';
export type EnterpriseRole = 'admin' | 'supervisor' | 'suporte';

export interface KitingoAuthenticatedUser {
  uid: string;
  fullName: string | null;
  phone?: string | null;
  email?: string | null;
  role: MobileProfileRole | EnterpriseRole | string;
  bancaCode?: string | null;
  bancaName?: string | null;
  bancaSector?: string | null;
  vehicleType?: string | null;
  vehiclePlate?: string | null;
  twoFactorEnabled?: boolean;
}

export interface BancaRegistryItem {
  id: number;
  bancaCode: string;
  ownerUid: string;
  bancaName: string;
  sector: string;
  nif: string | null;
  status: string;
  createdAt: string;
}

export interface AuthAuditLogItem {
  id: number;
  actorIdentifier: string;
  eventType: string;
  portal: string;
  metadata: string | null;
  createdAt: string;
}

/**
 * Optional Supabase Auth client initialization for environments with VITE_SUPABASE_URL
 * and VITE_SUPABASE_ANON_KEY configured, while defaulting to the integrated Kitingo
 * PostgreSQL Identity API.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseClient: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

// Keep active Firebase/Enterprise token in memory only (never in localStorage)
let inMemoryAccessToken: string | null = null;

export function getInMemoryAccessToken(): string | null {
  return inMemoryAccessToken;
}

export function formatAngolaPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const local = digits.startsWith('244') ? digits.slice(3) : digits;
  const trimmed = local.slice(0, 9);
  if (trimmed.length <= 3) return trimmed;
  if (trimmed.length <= 6) return `${trimmed.slice(0, 3)} ${trimmed.slice(3)}`;
  return `${trimmed.slice(0, 3)} ${trimmed.slice(3, 6)} ${trimmed.slice(6, 9)}`;
}

export function isValidAngolaMobile(localFormatted: string): boolean {
  const digits = localFormatted.replace(/\D/g, '');
  return digits.length === 9 && digits.startsWith('9');
}

export async function fetchNextBancaAllocation(): Promise<{
  nextBancaCode: string;
  totalRegisteredBancas: number;
  bancas: BancaRegistryItem[];
}> {
  const res = await fetch('/api/auth/next-banca-id');
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Não foi possível consultar o gerador de ID da Praça dos Correios.');
  }
  return data;
}

export async function requestMobileOtp(params: {
  phone: string;
  role: MobileProfileRole;
  channel?: 'sms_otp' | 'pin_recovery';
}): Promise<{
  success: boolean;
  phone: string;
  expiresInSeconds: number;
  existingAccount: boolean;
  existingRole: string | null;
  bancaCode: string | null;
  simulatedSmsCode: string;
}> {
  const fullPhone = params.phone.startsWith('+244')
    ? params.phone
    : `+244 ${formatAngolaPhoneInput(params.phone)}`;

  if (supabaseClient) {
    // Ready for external Supabase Auth SMS provider when configured
    await supabaseClient.auth.signInWithOtp({
      phone: fullPhone.replace(/\s+/g, ''),
      options: {
        data: { role: params.role },
      },
    });
  }

  const res = await fetch('/api/auth/mobile/send-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: fullPhone,
      role: params.role,
      channel: params.channel || 'sms_otp',
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Erro ao enviar código OTP para +244.');
  }
  return data;
}

export async function verifyMobileOtp(params: {
  phone: string;
  code: string;
  channel?: 'sms_otp' | 'pin_recovery';
}): Promise<{
  verified: boolean;
  phone: string;
  existingUser: {
    uid: string;
    fullName: string | null;
    role: string;
    bancaCode: string | null;
    bancaName: string | null;
    bancaSector: string | null;
    hasPin: boolean;
  } | null;
  allocatedBancaCode: string;
}> {
  const fullPhone = params.phone.startsWith('+244')
    ? params.phone
    : `+244 ${formatAngolaPhoneInput(params.phone)}`;

  const res = await fetch('/api/auth/mobile/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: fullPhone,
      code: params.code,
      channel: params.channel || 'sms_otp',
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Código OTP inválido ou expirado.');
  }
  return data;
}

export async function completeMobileRegistration(params: {
  phone: string;
  fullName: string;
  role: MobileProfileRole;
  pin?: string;
  bancaName?: string;
  bancaSector?: string;
  nif?: string;
  vehicleType?: string;
  vehiclePlate?: string;
}): Promise<{ success: boolean; user: KitingoAuthenticatedUser }> {
  const fullPhone = params.phone.startsWith('+244')
    ? params.phone
    : `+244 ${formatAngolaPhoneInput(params.phone)}`;

  const res = await fetch('/api/auth/mobile/complete-registration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...params,
      phone: fullPhone,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Não foi possível concluir o registo.');
  }
  return data;
}

export async function signInWithMobilePin(params: {
  phone: string;
  pin: string;
  role: MobileProfileRole;
}): Promise<{ success: boolean; user: KitingoAuthenticatedUser }> {
  const fullPhone = params.phone.startsWith('+244')
    ? params.phone
    : `+244 ${formatAngolaPhoneInput(params.phone)}`;

  const res = await fetch('/api/auth/mobile/pin-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: fullPhone,
      pin: params.pin,
      role: params.role,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Falha na autenticação por PIN.');
  }
  return data;
}

export async function resetMobilePinAfterOtp(params: {
  phone: string;
  newPin: string;
}): Promise<{ success: boolean; user: KitingoAuthenticatedUser }> {
  const fullPhone = params.phone.startsWith('+244')
    ? params.phone
    : `+244 ${formatAngolaPhoneInput(params.phone)}`;

  const res = await fetch('/api/auth/mobile/recover-pin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: fullPhone,
      newPin: params.newPin,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Não foi possível recuperar o PIN.');
  }
  return data;
}

export async function initiateEnterpriseLogin(params: {
  email: string;
  password: string;
  role: EnterpriseRole;
}): Promise<{
  challengeRequired: boolean;
  email: string;
  role: EnterpriseRole;
  fullName: string | null;
  expiresInSeconds: number;
  simulated2FACode: string;
}> {
  const res = await fetch('/api/auth/enterprise/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Falha na autenticação corporativa.');
  }
  return data;
}

export async function verifyEnterpriseTwoFactor(params: {
  email: string;
  code: string;
}): Promise<{
  authenticated: boolean;
  sessionToken: string;
  user: KitingoAuthenticatedUser;
}> {
  const res = await fetch('/api/auth/enterprise/verify-2fa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Código de verificação 2FA inválido.');
  }
  inMemoryAccessToken = data.sessionToken;
  return data;
}

export async function signInEnterpriseWithGoogleSso(
  role: EnterpriseRole
): Promise<KitingoAuthenticatedUser> {
  const credential = await signInWithPopup(auth, googleAuthProvider);
  const idToken = await credential.user.getIdToken();
  inMemoryAccessToken = idToken;

  const res = await fetch('/api/auth/firebase-sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ role }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Falha ao sincronizar conta Google SSO.');
  }
  return data.user;
}

export async function fetchIdentityDirectory(): Promise<{
  users: Array<KitingoAuthenticatedUser & { id: number; hasPinConfigured: boolean; verified: boolean; createdAt: string }>;
  bancas: BancaRegistryItem[];
  recentAudits: AuthAuditLogItem[];
}> {
  const res = await fetch('/api/auth/directory');
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Falha ao consultar diretório de identidades.');
  }
  return data;
}

export async function fetchActiveCustomerSession(): Promise<KitingoAuthenticatedUser | null> {
  try {
    const res = await fetch('/api/auth/active-customer');
    if (!res.ok) return null;
    const data = await res.json();
    return data.customer ?? null;
  } catch {
    return null;
  }
}
