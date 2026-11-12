/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import Page from '@/app/page';
import {
  AdminBackoffice,
  type BackofficeRole,
} from './components/admin/admin-backoffice.tsx';
import { EnterprisePortalLogin } from './components/auth/enterprise-portal-login.tsx';
import { MobileAuthScreen } from './components/auth/mobile-auth-screen.tsx';
import { DriverApp } from './components/logistics/driver-app.tsx';
import { LogisticsPartnerDashboard } from './components/logistics/logistics-partner-dashboard.tsx';
import { MerchantDashboard } from './components/merchant/merchant-dashboard.tsx';
import {
  fetchActiveCustomerSession,
  type KitingoAuthenticatedUser,
} from './lib/kitingo-auth.ts';

type KitingoModuleView =
  | 'admin_backoffice'
  | 'buyer_store'
  | 'driver_app'
  | 'merchant_dashboard'
  | 'logistics_partner'
  | 'mobile_auth'
  | 'enterprise_auth';

export default function App() {
  const [activeView, setActiveView] = useState<KitingoModuleView>('admin_backoffice');
  const [backofficeRole, setBackofficeRole] = useState<BackofficeRole>('super_admin');
  const [activeIdentity, setActiveIdentity] = useState<KitingoAuthenticatedUser | null>(null);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);

  // Restore registered customer automatically on application startup without requiring re-authentication
  useEffect(() => {
    let mounted = true;
    const handleQuotaExceeded = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);

    fetchActiveCustomerSession().then((customer) => {
      if (mounted && customer) {
        setActiveIdentity(customer);
      }
    });
    return () => {
      mounted = false;
      window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {gmpQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}
      {/* 3-Zone Top Bar Contract for Singular Module Navigation */}
      <header className="flex items-center justify-between gap-4 border-b border-border bg-card px-4 py-2.5 md:px-6">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveView('admin_backoffice');
          }}
          className="text-base font-bold tracking-tight text-foreground whitespace-nowrap shrink-0"
        >
          Kitingo
        </a>

        <nav
          aria-label="Aplicações Singulares do Ecossistema Kitingo"
          className="flex items-center gap-4 overflow-x-auto text-xs font-medium text-muted-foreground sm:text-sm"
        >
          <button
            type="button"
            onClick={() => setActiveView('admin_backoffice')}
            className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              activeView === 'admin_backoffice'
                ? 'border-b-2 border-primary font-semibold text-foreground'
                : 'hover:text-foreground'
            }`}
          >
            Back-Office & Torre GPS
          </button>
          <button
            type="button"
            onClick={() => setActiveView('buyer_store')}
            className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              activeView === 'buyer_store'
                ? 'border-b-2 border-primary font-semibold text-foreground'
                : 'hover:text-foreground'
            }`}
          >
            App Comprador
          </button>
          <button
            type="button"
            onClick={() => setActiveView('driver_app')}
            className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              activeView === 'driver_app'
                ? 'border-b-2 border-primary font-semibold text-foreground'
                : 'hover:text-foreground'
            }`}
          >
            App Estafeta
          </button>
          <button
            type="button"
            onClick={() => setActiveView('merchant_dashboard')}
            className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              activeView === 'merchant_dashboard'
                ? 'border-b-2 border-primary font-semibold text-foreground'
                : 'hover:text-foreground'
            }`}
          >
            Painel da Banca
          </button>
          <button
            type="button"
            onClick={() => setActiveView('logistics_partner')}
            className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              activeView === 'logistics_partner'
                ? 'border-b-2 border-primary font-semibold text-foreground'
                : 'hover:text-foreground'
            }`}
          >
            Painel Logística
          </button>
          <button
            type="button"
            onClick={() => setActiveView('mobile_auth')}
            className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              activeView === 'mobile_auth'
                ? 'border-b-2 border-primary font-semibold text-foreground'
                : 'hover:text-foreground'
            }`}
          >
            Login Mobile
          </button>
          <button
            type="button"
            onClick={() => setActiveView('enterprise_auth')}
            className={`py-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              activeView === 'enterprise_auth'
                ? 'border-b-2 border-primary font-semibold text-foreground'
                : 'hover:text-foreground'
            }`}
          >
            Portal Enterprise
          </button>
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveView('enterprise_auth')}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-95 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Credenciais & Login
          </button>
        </div>
      </header>

      {/* 0. Admin, Live GPS Control Tower & Call Center Back-Office */}
      {activeView === 'admin_backoffice' && (
        <AdminBackoffice
          key={backofficeRole}
          initialRole={backofficeRole}
          authenticatedStaffName={activeIdentity?.fullName ?? null}
          authenticatedStaffEmail={activeIdentity?.email ?? null}
        />
      )}

      {/* 1. App Comprador (Singular Customer App) */}
      {activeView === 'buyer_store' && (
        <Page
          customerName={activeIdentity?.fullName ?? undefined}
          customerPhone={activeIdentity?.phone ?? undefined}
        />
      )}

      {/* 2. App Estafeta (Singular Mobile Driver App like App Comprador) */}
      {activeView === 'driver_app' && (
        <DriverApp
          driverName={
            activeIdentity?.role === 'estafeta' ? activeIdentity.fullName : 'Paulo Sebastião'
          }
          driverPhone={
            activeIdentity?.role === 'estafeta' ? activeIdentity.phone : '+244 931 880 210'
          }
        />
      )}

      {/* 3. Painel da Banca (Singular Merchant App) */}
      {activeView === 'merchant_dashboard' && (
        <MerchantDashboard
          bancaCode={
            activeIdentity?.role === 'vendedor' ? activeIdentity.bancaCode : 'PC-008'
          }
          bancaName={
            activeIdentity?.role === 'vendedor'
              ? activeIdentity.bancaName
              : 'Banca #08 - Peças do Zé'
          }
          vendorName={
            activeIdentity?.role === 'vendedor' ? activeIdentity.fullName : 'José Baptista'
          }
          vendorPhone={
            activeIdentity?.role === 'vendedor' ? activeIdentity.phone : '+244 924 514 008'
          }
        />
      )}

      {/* 4. Painel Logística (Singular Logistics Partner Enterprise Dashboard) */}
      {activeView === 'logistics_partner' && (
        <LogisticsPartnerDashboard
          partnerAdminName={
            activeIdentity?.email ? activeIdentity.fullName : 'Direção de Operações · Frota Luanda'
          }
          partnerAdminEmail={activeIdentity?.email ?? 'logistica@kitingo.ao'}
        />
      )}

      {/* 5. Login Mobile (Routes Cliente -> App Comprador, Vendedor -> Painel da Banca, Estafeta -> App Estafeta) */}
      {activeView === 'mobile_auth' && (
        <MobileAuthScreen
          activeCustomer={activeIdentity?.role === 'cliente' ? activeIdentity : null}
          onSessionAuthenticated={(user) => setActiveIdentity(user)}
          onNavigateToBuyerStore={() => setActiveView('buyer_store')}
          onNavigateToMerchantDashboard={() => setActiveView('merchant_dashboard')}
          onNavigateToDriverApp={() => setActiveView('driver_app')}
        />
      )}

      {/* 6. Portal Enterprise (Routes Super Admin / Supervisor / Call Center -> Back-Office & Torre GPS) */}
      {activeView === 'enterprise_auth' && (
        <EnterprisePortalLogin
          onEnterpriseAuthenticated={(user) => {
            setActiveIdentity(user);
            const mappedRole: BackofficeRole =
              user.role === 'supervisor'
                ? 'field_supervisor'
                : user.role === 'suporte'
                  ? 'call_center'
                  : 'super_admin';
            setBackofficeRole(mappedRole);
            setActiveView('admin_backoffice');
          }}
          onNavigateToLogisticsPartner={() => setActiveView('logistics_partner')}
          onNavigateToAdminBackoffice={(role) => {
            if (role) setBackofficeRole(role);
            setActiveView('admin_backoffice');
          }}
        />
      )}
    </div>
  );
}
