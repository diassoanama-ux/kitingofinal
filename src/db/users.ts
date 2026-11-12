import { desc, eq, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  adminAuditTrails,
  authAuditLogs,
  bancaRegistry,
  customerOrders,
  deliveryMissions,
  deliveryTrackingEvents,
  financialSplitAudits,
  logisticsDrivers,
  logisticsSettlements,
  merchantInventory,
  merchantPayouts,
  otpChallenges,
  sampleMatches,
  supportTickets,
  users,
} from './schema.ts';

export async function getOrCreateUser(
  uid: string,
  email: string,
  extra?: {
    phone?: string;
    fullName?: string;
    role?: string;
    bancaCode?: string;
    bancaName?: string;
    bancaSector?: string;
    vehicleType?: string;
    vehiclePlate?: string;
    pinHash?: string;
    twoFactorEnabled?: boolean;
    verified?: boolean;
  }
) {
  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        phone: extra?.phone ?? null,
        fullName: extra?.fullName ?? null,
        role: extra?.role ?? 'cliente',
        bancaCode: extra?.bancaCode ?? null,
        bancaName: extra?.bancaName ?? null,
        bancaSector: extra?.bancaSector ?? null,
        vehicleType: extra?.vehicleType ?? null,
        vehiclePlate: extra?.vehiclePlate ?? null,
        pinHash: extra?.pinHash ?? null,
        twoFactorEnabled: extra?.twoFactorEnabled ?? false,
        verified: extra?.verified ?? true,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          ...(extra?.phone !== undefined ? { phone: extra.phone } : {}),
          ...(extra?.fullName !== undefined ? { fullName: extra.fullName } : {}),
          ...(extra?.role !== undefined ? { role: extra.role } : {}),
          ...(extra?.bancaCode !== undefined ? { bancaCode: extra.bancaCode } : {}),
          ...(extra?.bancaName !== undefined ? { bancaName: extra.bancaName } : {}),
          ...(extra?.bancaSector !== undefined ? { bancaSector: extra.bancaSector } : {}),
          ...(extra?.vehicleType !== undefined ? { vehicleType: extra.vehicleType } : {}),
          ...(extra?.vehiclePlate !== undefined ? { vehiclePlate: extra.vehiclePlate } : {}),
          ...(extra?.pinHash !== undefined ? { pinHash: extra.pinHash } : {}),
          ...(extra?.twoFactorEnabled !== undefined ? { twoFactorEnabled: extra.twoFactorEnabled } : {}),
          ...(extra?.verified !== undefined ? { verified: extra.verified } : {}),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed in getOrCreateUser:', error);
    throw new Error('Failed to synchronize user account.', { cause: error });
  }
}

export async function getUserByPhone(phone: string) {
  try {
    const rows = await db.select().from(users).where(eq(users.phone, phone));
    return rows[0] ?? null;
  } catch (error) {
    console.error('Database query failed in getUserByPhone:', error);
    throw new Error('Failed to look up phone account.', { cause: error });
  }
}

export async function getUserByEmail(email: string) {
  try {
    const rows = await db.select().from(users).where(eq(users.email, email));
    return rows[0] ?? null;
  } catch (error) {
    console.error('Database query failed in getUserByEmail:', error);
    throw new Error('Failed to look up email account.', { cause: error });
  }
}

export async function getNextAvailableBancaCode(): Promise<string> {
  try {
    const existing = await db.select().from(bancaRegistry).orderBy(desc(bancaRegistry.id));
    if (existing.length === 0) {
      return 'PC-042';
    }
    const maxNum = existing.reduce((acc, row) => {
      const match = row.bancaCode.match(/^PC-(\d+)$/);
      const num = match ? parseInt(match[1], 10) : 41;
      return Math.max(acc, num);
    }, 41);
    const nextNum = maxNum + 1;
    return `PC-${String(nextNum).padStart(3, '0')}`;
  } catch (error) {
    console.error('Database query failed in getNextAvailableBancaCode:', error);
    throw new Error('Failed to generate unique Banca ID.', { cause: error });
  }
}

export async function registerBancaRecord(data: {
  bancaCode: string;
  ownerUid: string;
  bancaName: string;
  sector: string;
  nif?: string;
}) {
  try {
    const inserted = await db
      .insert(bancaRegistry)
      .values({
        bancaCode: data.bancaCode,
        ownerUid: data.ownerUid,
        bancaName: data.bancaName,
        sector: data.sector,
        nif: data.nif ?? null,
        status: 'active',
      })
      .onConflictDoUpdate({
        target: bancaRegistry.bancaCode,
        set: {
          bancaName: data.bancaName,
          sector: data.sector,
        },
      })
      .returning();
    return inserted[0];
  } catch (error) {
    console.error('Database query failed in registerBancaRecord:', error);
    throw new Error('Failed to register Banca in Praça dos Correios directory.', { cause: error });
  }
}

export async function createOtpChallengeRecord(data: {
  identifier: string;
  channel: string;
  profileRole: string;
  code: string;
  expiresAt: Date;
}) {
  try {
    const inserted = await db
      .insert(otpChallenges)
      .values({
        identifier: data.identifier,
        channel: data.channel,
        profileRole: data.profileRole,
        code: data.code,
        attempts: 0,
        consumed: false,
        expiresAt: data.expiresAt,
      })
      .returning();
    return inserted[0];
  } catch (error) {
    console.error('Database query failed in createOtpChallengeRecord:', error);
    throw new Error('Failed to create OTP challenge.', { cause: error });
  }
}

export async function getLatestOtpChallenge(identifier: string, channel: string) {
  try {
    const rows = await db
      .select()
      .from(otpChallenges)
      .where(eq(otpChallenges.identifier, identifier))
      .orderBy(desc(otpChallenges.id));
    return rows.find((r) => r.channel === channel && !r.consumed) ?? null;
  } catch (error) {
    console.error('Database query failed in getLatestOtpChallenge:', error);
    throw new Error('Failed to retrieve OTP challenge.', { cause: error });
  }
}

export async function updateOtpChallengeState(
  id: number,
  updates: { attempts?: number; consumed?: boolean }
) {
  try {
    const rows = await db
      .update(otpChallenges)
      .set(updates)
      .where(eq(otpChallenges.id, id))
      .returning();
    return rows[0];
  } catch (error) {
    console.error('Database query failed in updateOtpChallengeState:', error);
    throw new Error('Failed to update OTP challenge status.', { cause: error });
  }
}

export async function recordAuthAudit(data: {
  userId?: number | null;
  actorIdentifier: string;
  eventType: string;
  portal: string;
  metadata?: string;
}) {
  try {
    const rows = await db
      .insert(authAuditLogs)
      .values({
        userId: data.userId ?? null,
        actorIdentifier: data.actorIdentifier,
        eventType: data.eventType,
        portal: data.portal,
        metadata: data.metadata ?? null,
      })
      .returning();
    return rows[0];
  } catch (error) {
    console.error('Database query failed in recordAuthAudit:', error);
    throw new Error('Failed to record security audit log.', { cause: error });
  }
}

export async function listRecentAuthAccounts() {
  try {
    const allUsers = await db.select().from(users).orderBy(desc(users.id));
    const allBancas = await db.select().from(bancaRegistry).orderBy(desc(bancaRegistry.id));
    const allLogs = await db.select().from(authAuditLogs).orderBy(desc(authAuditLogs.id));
    return {
      users: allUsers.map((u) => ({
        id: u.id,
        uid: u.uid,
        email: u.email,
        phone: u.phone,
        fullName: u.fullName,
        role: u.role,
        bancaCode: u.bancaCode,
        bancaName: u.bancaName,
        bancaSector: u.bancaSector,
        vehicleType: u.vehicleType,
        vehiclePlate: u.vehiclePlate,
        hasPinConfigured: Boolean(u.pinHash),
        twoFactorEnabled: u.twoFactorEnabled,
        verified: u.verified,
        createdAt: u.createdAt,
      })),
      bancas: allBancas,
      recentAudits: allLogs.slice(0, 12),
    };
  } catch (error) {
    console.error('Database query failed in listRecentAuthAccounts:', error);
    throw new Error('Failed to list Kitingo identity records.', { cause: error });
  }
}

export async function saveCustomerOrderRecord(data: {
  orderCode: string;
  customerName?: string | null;
  customerPhone?: string | null;
  location?: string | null;
  entity: string;
  reference: string;
  amount: number;
  itemCount: number;
  itemsJson: string;
  status?: string;
}) {
  try {
    const inserted = await db
      .insert(customerOrders)
      .values({
        orderCode: data.orderCode,
        customerName: data.customerName ?? null,
        customerPhone: data.customerPhone ?? null,
        location: data.location ?? 'Luanda, Angola',
        entity: data.entity,
        reference: data.reference,
        amount: data.amount,
        itemCount: data.itemCount,
        itemsJson: data.itemsJson,
        status: data.status ?? 'aguarda_pagamento',
      })
      .onConflictDoUpdate({
        target: customerOrders.orderCode,
        set: {
          status: data.status ?? 'aguarda_pagamento',
          itemsJson: data.itemsJson,
        },
      })
      .returning();
    return inserted[0];
  } catch (error) {
    console.error('Database query failed in saveCustomerOrderRecord:', error);
    throw new Error('Failed to save customer order in database.', { cause: error });
  }
}

export async function listCustomerOrdersRecords(customerPhone?: string) {
  try {
    const rows = customerPhone
      ? await db
          .select()
          .from(customerOrders)
          .where(eq(customerOrders.customerPhone, customerPhone))
          .orderBy(desc(customerOrders.id))
      : await db.select().from(customerOrders).orderBy(desc(customerOrders.id));
    return rows;
  } catch (error) {
    console.error('Database query failed in listCustomerOrdersRecords:', error);
    throw new Error('Failed to load customer orders from database.', { cause: error });
  }
}

export async function updateCustomerOrderStatusRecord(
  orderCode: string,
  updates: { status?: string; location?: string }
) {
  try {
    const rows = await db
      .update(customerOrders)
      .set({
        ...(updates.status ? { status: updates.status } : {}),
        ...(updates.location ? { location: updates.location } : {}),
      })
      .where(eq(customerOrders.orderCode, orderCode))
      .returning();
    return rows[0] ?? null;
  } catch (error) {
    console.error('Database query failed in updateCustomerOrderStatusRecord:', error);
    throw new Error('Failed to update customer order status.', { cause: error });
  }
}

export async function saveSampleMatchRecord(data: {
  matchCode: string;
  customerName?: string | null;
  customerPhone?: string | null;
  vehicleModel: string;
  vehicleYear: string;
  partNotes?: string | null;
  preferredCondition: string;
  photosJson: string;
  status?: string;
  vendorQuotesJson?: string | null;
}) {
  try {
    const inserted = await db
      .insert(sampleMatches)
      .values({
        matchCode: data.matchCode,
        customerName: data.customerName ?? null,
        customerPhone: data.customerPhone ?? null,
        vehicleModel: data.vehicleModel,
        vehicleYear: data.vehicleYear,
        partNotes: data.partNotes ?? null,
        preferredCondition: data.preferredCondition,
        photosJson: data.photosJson,
        status: data.status ?? 'cotacao_recebida',
        vendorQuotesJson: data.vendorQuotesJson ?? null,
      })
      .onConflictDoUpdate({
        target: sampleMatches.matchCode,
        set: {
          status: data.status ?? 'cotacao_recebida',
          vendorQuotesJson: data.vendorQuotesJson ?? null,
        },
      })
      .returning();
    return inserted[0];
  } catch (error) {
    console.error('Database query failed in saveSampleMatchRecord:', error);
    throw new Error('Failed to save sample match request in database.', { cause: error });
  }
}

export async function listSampleMatchesRecords() {
  try {
    const rows = await db.select().from(sampleMatches).orderBy(desc(sampleMatches.id));
    return rows;
  } catch (error) {
    console.error('Database query failed in listSampleMatchesRecords:', error);
    throw new Error('Failed to load sample match queue from database.', { cause: error });
  }
}

export async function respondToSampleMatchRecord(
  matchCode: string,
  action: 'link_part' | 'reject' | 'suspend',
  newQuote?: {
    quoteId: string;
    bancaCode: string;
    bancaName: string;
    condition: 'nova' | 'ocasiao';
    brand: string;
    warrantyLabel: string;
    price: number;
    availabilityText: string;
    productId: string;
  }
) {
  try {
    const existingRows = await db
      .select()
      .from(sampleMatches)
      .where(eq(sampleMatches.matchCode, matchCode));
    const current = existingRows[0];
    if (!current) {
      throw new Error('Sample match request not found.');
    }

    if (action === 'reject') {
      const updated = await db
        .update(sampleMatches)
        .set({ status: 'rejeitado' })
        .where(eq(sampleMatches.matchCode, matchCode))
        .returning();
      return updated[0];
    }

    if (action === 'suspend') {
      const updated = await db
        .update(sampleMatches)
        .set({ status: 'suspensa' })
        .where(eq(sampleMatches.matchCode, matchCode))
        .returning();
      return updated[0];
    }

    let currentQuotes: any[] = [];
    try {
      currentQuotes = JSON.parse(current.vendorQuotesJson || '[]');
    } catch {
      currentQuotes = [];
    }

    const nextQuotes = newQuote ? [newQuote, ...currentQuotes] : currentQuotes;
    const updated = await db
      .update(sampleMatches)
      .set({
        status: 'cotacao_recebida',
        vendorQuotesJson: JSON.stringify(nextQuotes),
      })
      .where(eq(sampleMatches.matchCode, matchCode))
      .returning();
    return updated[0];
  } catch (error) {
    console.error('Database query failed in respondToSampleMatchRecord:', error);
    throw new Error('Failed to update sample match response.', { cause: error });
  }
}

export async function listMerchantInventoryRecords(bancaCode?: string) {
  try {
    const rows = bancaCode
      ? await db
          .select()
          .from(merchantInventory)
          .where(eq(merchantInventory.bancaCode, bancaCode))
          .orderBy(desc(merchantInventory.id))
      : await db.select().from(merchantInventory).orderBy(desc(merchantInventory.id));
    return rows;
  } catch (error) {
    console.error('Database query failed in listMerchantInventoryRecords:', error);
    throw new Error('Failed to load merchant inventory.', { cause: error });
  }
}

export async function saveMerchantInventoryRecord(data: {
  partCode: string;
  bancaCode: string;
  bancaName: string;
  name: string;
  category: string;
  compatibility: string;
  condition: string;
  conditionGrade: string;
  brand: string;
  warrantyLabel: string;
  price: number;
  inStock: number;
  image: string;
}) {
  try {
    const inserted = await db
      .insert(merchantInventory)
      .values({
        partCode: data.partCode,
        bancaCode: data.bancaCode,
        bancaName: data.bancaName,
        name: data.name,
        category: data.category,
        compatibility: data.compatibility,
        condition: data.condition,
        conditionGrade: data.conditionGrade,
        brand: data.brand,
        warrantyLabel: data.warrantyLabel,
        price: data.price,
        inStock: data.inStock,
        image: data.image,
      })
      .onConflictDoUpdate({
        target: merchantInventory.partCode,
        set: {
          price: data.price,
          inStock: data.inStock,
          condition: data.condition,
          conditionGrade: data.conditionGrade,
        },
      })
      .returning();
    return inserted[0];
  } catch (error) {
    console.error('Database query failed in saveMerchantInventoryRecord:', error);
    throw new Error('Failed to save merchant inventory part.', { cause: error });
  }
}

export async function listMerchantPayoutsRecords(bancaCode?: string) {
  try {
    const rows = bancaCode
      ? await db
          .select()
          .from(merchantPayouts)
          .where(eq(merchantPayouts.bancaCode, bancaCode))
          .orderBy(desc(merchantPayouts.id))
      : await db.select().from(merchantPayouts).orderBy(desc(merchantPayouts.id));
    return rows;
  } catch (error) {
    console.error('Database query failed in listMerchantPayoutsRecords:', error);
    throw new Error('Failed to load merchant payouts.', { cause: error });
  }
}

export async function createMerchantSplitPayoutRecord(data: {
  payoutCode: string;
  orderCode: string;
  bancaCode: string;
  bancaName: string;
  driverName: string;
  handoverOtp: string;
  grossAmount: number;
  platformSplitAmount: number;
  netBancaAmount: number;
}) {
  try {
    const inserted = await db
      .insert(merchantPayouts)
      .values({
        payoutCode: data.payoutCode,
        orderCode: data.orderCode,
        bancaCode: data.bancaCode,
        bancaName: data.bancaName,
        driverName: data.driverName,
        handoverOtp: data.handoverOtp,
        grossAmount: data.grossAmount,
        platformSplitAmount: data.platformSplitAmount,
        netBancaAmount: data.netBancaAmount,
        status: 'liquidado',
      })
      .returning();
    return inserted[0];
  } catch (error) {
    console.error('Database query failed in createMerchantSplitPayoutRecord:', error);
    throw new Error('Failed to record automated split payout.', { cause: error });
  }
}

export async function listLogisticsDriversRecords() {
  try {
    const rows = await db
      .select()
      .from(logisticsDrivers)
      .orderBy(desc(logisticsDrivers.id));
    return rows;
  } catch (error) {
    console.error('Database query failed in listLogisticsDriversRecords:', error);
    throw new Error('Failed to load logistics drivers.', { cause: error });
  }
}

export async function createLogisticsDriverRecord(data: {
  driverCode: string;
  fullName: string;
  phone: string;
  nif?: string | null;
  vehicleType: string;
  vehiclePlate: string;
  zone: string;
  licenseDocUrl?: string | null;
  idDocUrl?: string | null;
  vehicleDocUrl?: string | null;
}) {
  try {
    const inserted = await db
      .insert(logisticsDrivers)
      .values({
        driverCode: data.driverCode,
        fullName: data.fullName,
        phone: data.phone,
        nif: data.nif ?? null,
        vehicleType: data.vehicleType,
        vehiclePlate: data.vehiclePlate,
        zone: data.zone,
        status: 'disponivel',
        deliveriesToday: 0,
        otpSuccessRate: '100%',
        licenseDocUrl: data.licenseDocUrl ?? 'Carta-Verificada.pdf',
        idDocUrl: data.idDocUrl ?? 'BI-Verificado.pdf',
        vehicleDocUrl: data.vehicleDocUrl ?? 'Livrete-Verificado.pdf',
      })
      .returning();
    return inserted[0];
  } catch (error) {
    console.error('Database query failed in createLogisticsDriverRecord:', error);
    throw new Error('Failed to register new logistics driver.', { cause: error });
  }
}

export async function incrementDriverCompletedDeliveryRecord(driverCode: string) {
  try {
    const existing = await db
      .select()
      .from(logisticsDrivers)
      .where(eq(logisticsDrivers.driverCode, driverCode));
    const current = existing[0];
    if (!current) return null;
    const updated = await db
      .update(logisticsDrivers)
      .set({
        deliveriesToday: (current.deliveriesToday || 0) + 1,
        status: 'em_rota',
      })
      .where(eq(logisticsDrivers.driverCode, driverCode))
      .returning();
    return updated[0] ?? null;
  } catch (error) {
    console.error('Database query failed in incrementDriverCompletedDeliveryRecord:', error);
    return null;
  }
}

export async function listLogisticsSettlementsRecords() {
  try {
    const rows = await db
      .select()
      .from(logisticsSettlements)
      .orderBy(desc(logisticsSettlements.id));
    return rows;
  } catch (error) {
    console.error('Database query failed in listLogisticsSettlementsRecords:', error);
    throw new Error('Failed to load logistics settlements.', { cause: error });
  }
}

export async function listBancaRegistryRecords() {
  try {
    return await db.select().from(bancaRegistry).orderBy(desc(bancaRegistry.id));
  } catch (error) {
    console.error('Database query failed in listBancaRegistryRecords:', error);
    throw new Error('Failed to load banca registry.', { cause: error });
  }
}

export async function updateBancaGovernanceStatusRecord(
  bancaCode: string,
  status: 'ativa' | 'suspensa' | 'bloqueada_fraude' | 'pendente',
  fraudReason?: string | null
) {
  try {
    const rows = await db
      .update(bancaRegistry)
      .set({
        status,
        fraudReason: fraudReason !== undefined ? fraudReason : null,
        updatedAt: new Date(),
      })
      .where(eq(bancaRegistry.bancaCode, bancaCode))
      .returning();
    return rows[0] ?? null;
  } catch (error) {
    console.error('Database query failed in updateBancaGovernanceStatusRecord:', error);
    throw new Error('Failed to update banca governance status.', { cause: error });
  }
}

export async function homologateNewBancaRecord(data: {
  bancaCode: string;
  ownerName: string;
  ownerPhone: string;
  bancaName: string;
  sector: string;
  nif: string;
  status?: 'ativa' | 'pendente';
}) {
  try {
    const rows = await db
      .insert(bancaRegistry)
      .values({
        bancaCode: data.bancaCode,
        ownerUid: `vendor-${data.bancaCode.toLowerCase()}`,
        ownerName: data.ownerName,
        ownerPhone: data.ownerPhone,
        bancaName: data.bancaName,
        sector: data.sector,
        nif: data.nif,
        status: data.status ?? 'ativa',
        fraudReason: null,
      })
      .onConflictDoUpdate({
        target: bancaRegistry.bancaCode,
        set: {
          ownerName: data.ownerName,
          ownerPhone: data.ownerPhone,
          bancaName: data.bancaName,
          sector: data.sector,
          nif: data.nif,
          status: data.status ?? 'ativa',
          updatedAt: new Date(),
        },
      })
      .returning();
    return rows[0];
  } catch (error) {
    console.error('Database query failed in homologateNewBancaRecord:', error);
    throw new Error('Failed to homologate new banca.', { cause: error });
  }
}

export async function updateLogisticsDriverTelemetryRecord(
  driverCode: string,
  updates: {
    status?: string;
    speedKmh?: number;
    batteryLevel?: number;
    activeOrderCode?: string | null;
    lat?: string;
    lng?: string;
    currentStreet?: string;
  }
) {
  try {
    const rows = await db
      .update(logisticsDrivers)
      .set({
        ...(updates.status !== undefined ? { status: updates.status } : {}),
        ...(updates.speedKmh !== undefined ? { speedKmh: updates.speedKmh } : {}),
        ...(updates.batteryLevel !== undefined ? { batteryLevel: updates.batteryLevel } : {}),
        ...(updates.activeOrderCode !== undefined ? { activeOrderCode: updates.activeOrderCode } : {}),
        ...(updates.lat !== undefined ? { lat: updates.lat } : {}),
        ...(updates.lng !== undefined ? { lng: updates.lng } : {}),
        ...(updates.currentStreet !== undefined ? { currentStreet: updates.currentStreet } : {}),
      })
      .where(eq(logisticsDrivers.driverCode, driverCode))
      .returning();
    return rows[0] ?? null;
  } catch (error) {
    console.error('Database query failed in updateLogisticsDriverTelemetryRecord:', error);
    throw new Error('Failed to update driver GPS telemetry.', { cause: error });
  }
}

export async function listSupportTicketsRecords() {
  try {
    return await db.select().from(supportTickets).orderBy(desc(supportTickets.id));
  } catch (error) {
    console.error('Database query failed in listSupportTicketsRecords:', error);
    throw new Error('Failed to load Call Center support tickets.', { cause: error });
  }
}

export async function createSupportTicketRecord(data: {
  ticketCode?: string;
  originRole: 'cliente' | 'estafeta' | 'banca';
  customerName: string;
  customerPhone: string;
  orderCode?: string | null;
  matchCode?: string | null;
  bancaCode: string;
  bancaName: string;
  subject: string;
  priority?: 'urgente' | 'alta' | 'normal';
  status?: 'aberto' | 'em_mediacao' | 'resolvido';
  vehicleModel?: string;
  clientSamplePhotoUrl?: string;
  clientPartDescription?: string;
  merchantOfferPhotoUrl?: string;
  merchantOfferPartName?: string;
  merchantOfferCondition?: 'nova' | 'ocasiao';
  merchantOfferPriceKz?: number;
  initialMessageText: string;
  reporterName: string;
  assignedStaffId?: string;
}) {
  try {
    const ticketCode =
      data.ticketCode || `TK-${Math.floor(4100 + Math.random() * 5890)}`;
    const nowStr = new Date().toLocaleTimeString('pt-AO', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const roleTag =
      data.originRole === 'estafeta'
        ? '[ESTAFETA]'
        : data.originRole === 'banca'
          ? '[BANCA]'
          : '[CLIENTE]';

    const formattedSubject = data.subject.startsWith('[')
      ? data.subject
      : `${roleTag} ${data.subject}`;

    const initialMessages = [
      {
        id: `msg-${Date.now()}-1`,
        sender: `${data.reporterName} (${roleTag.replace(/[\[\]]/g, '')})`,
        senderRole: data.originRole,
        text: data.initialMessageText,
        timestamp: nowStr,
      },
      {
        id: `msg-${Date.now()}-2`,
        sender: 'Central Back-Office Kitingo (CCA-029)',
        senderRole: 'call_center',
        text: `Ticket ${ticketCode} recebido no Back-Office Kitingo. A equipa de mediação técnica e supervisão já está a analisar a ocorrência (${data.orderCode || 'Praça dos Correios'}).`,
        timestamp: nowStr,
      },
    ];

    const rows = await db
      .insert(supportTickets)
      .values({
        ticketCode,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        orderCode: data.orderCode ?? 'CE-650018',
        matchCode: data.matchCode ?? 'MA-904',
        bancaCode: data.bancaCode || 'PC-008',
        bancaName: data.bancaName || 'Banca #08 - Peças do Zé',
        subject: formattedSubject,
        priority: data.priority ?? 'alta',
        status: data.status ?? 'aberto',
        vehicleModel: data.vehicleModel || 'Toyota Hilux 2.8 GD-6 (2021)',
        clientSamplePhotoUrl:
          data.clientSamplePhotoUrl ||
          '/assets/parts/alternador-hilux.jpg',
        clientPartDescription:
          data.clientPartDescription || data.initialMessageText,
        merchantOfferPhotoUrl:
          data.merchantOfferPhotoUrl ||
          '/assets/parts/alternador-hilux.jpg',
        merchantOfferPartName:
          data.merchantOfferPartName ||
          'Alternador Denso 12V 150A · Toyota Hilux',
        merchantOfferCondition: data.merchantOfferCondition ?? 'ocasiao',
        merchantOfferPriceKz: data.merchantOfferPriceKz ?? 145000,
        chatMessagesJson: JSON.stringify(initialMessages),
        assignedStaffId: data.assignedStaffId ?? 'CCA-029',
      })
      .returning();

    return rows[0];
  } catch (error) {
    console.error('Database query failed in createSupportTicketRecord:', error);
    throw new Error('Failed to create support ticket.', { cause: error });
  }
}

export async function appendSupportTicketChatRecord(
  ticketCode: string,
  newMessage?: {
    id: string;
    sender: string;
    senderRole: string;
    text: string;
    timestamp: string;
  },
  nextStatus?: string
) {
  try {
    const existingRows = await db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.ticketCode, ticketCode));
    const current = existingRows[0];
    if (!current) {
      throw new Error('Ticket de suporte não encontrado.');
    }

    let messages: any[] = [];
    try {
      messages = JSON.parse(current.chatMessagesJson || '[]');
    } catch {
      messages = [];
    }

    if (newMessage) {
      messages.push(newMessage);
    }

    const updated = await db
      .update(supportTickets)
      .set({
        chatMessagesJson: JSON.stringify(messages),
        ...(nextStatus ? { status: nextStatus } : {}),
        updatedAt: new Date(),
      })
      .where(eq(supportTickets.ticketCode, ticketCode))
      .returning();
    return updated[0];
  } catch (error) {
    console.error('Database query failed in appendSupportTicketChatRecord:', error);
    throw new Error('Failed to update support ticket.', { cause: error });
  }
}

export async function listFinancialSplitAuditsRecords() {
  try {
    return await db.select().from(financialSplitAudits).orderBy(desc(financialSplitAudits.id));
  } catch (error) {
    console.error('Database query failed in listFinancialSplitAuditsRecords:', error);
    throw new Error('Failed to load financial split audits.', { cause: error });
  }
}

export async function reprocessFinancialSplitRecord(splitCode: string, staffId: string) {
  try {
    const existingRows = await db
      .select()
      .from(financialSplitAudits)
      .where(eq(financialSplitAudits.splitCode, splitCode));
    const current = existingRows[0];
    if (!current) {
      throw new Error('Registo de Split não encontrado.');
    }

    const resolvedRef = `${current.bankName}-REPROC-${Date.now().toString().slice(-6)}`;
    const updated = await db
      .update(financialSplitAudits)
      .set({
        status: 'liquidado',
        failureReason: null,
        bankTransactionRef: resolvedRef,
        reprocessedByStaffId: staffId,
        reprocessedAt: new Date(),
      })
      .where(eq(financialSplitAudits.splitCode, splitCode))
      .returning();
    return updated[0];
  } catch (error) {
    console.error('Database query failed in reprocessFinancialSplitRecord:', error);
    throw new Error('Failed to reprocess financial split.', { cause: error });
  }
}

export async function listAdminAuditTrailsRecords() {
  try {
    return await db.select().from(adminAuditTrails).orderBy(desc(adminAuditTrails.id));
  } catch (error) {
    console.error('Database query failed in listAdminAuditTrailsRecords:', error);
    throw new Error('Failed to load admin audit trails.', { cause: error });
  }
}

export async function createAdminAuditTrailRecord(data: {
  staffId: string;
  staffName: string;
  staffRole: string;
  actionType: string;
  targetEntity: string;
  targetCode: string;
  severity?: 'info' | 'warning' | 'critical';
  details: string;
}) {
  try {
    const auditCode = `AUD-${Math.floor(10000 + Math.random() * 89999)}`;
    const rows = await db
      .insert(adminAuditTrails)
      .values({
        auditCode,
        staffId: data.staffId,
        staffName: data.staffName,
        staffRole: data.staffRole,
        actionType: data.actionType,
        targetEntity: data.targetEntity,
        targetCode: data.targetCode,
        severity: data.severity ?? 'info',
        details: data.details,
      })
      .returning();
    return rows[0];
  } catch (error) {
    console.error('Database query failed in createAdminAuditTrailRecord:', error);
    throw new Error('Failed to write admin audit trail.', { cause: error });
  }
}

export async function listDeliveryMissionsRecords(customerPhone?: string) {
  try {
    const rows = customerPhone
      ? await db
          .select()
          .from(deliveryMissions)
          .where(eq(deliveryMissions.customerPhone, customerPhone))
          .orderBy(desc(deliveryMissions.updatedAt))
      : await db.select().from(deliveryMissions).orderBy(desc(deliveryMissions.updatedAt));
    return rows;
  } catch (error) {
    console.error('Database query failed in listDeliveryMissionsRecords:', error);
    throw new Error('Failed to load delivery missions.', { cause: error });
  }
}

export async function getDeliveryMissionByOrderCode(orderCode: string) {
  try {
    const rows = await db
      .select()
      .from(deliveryMissions)
      .where(eq(deliveryMissions.orderCode, orderCode));
    return rows[0] ?? null;
  } catch (error) {
    console.error('Database query failed in getDeliveryMissionByOrderCode:', error);
    return null;
  }
}

export async function upsertDeliveryMissionRecord(data: {
  orderCode: string;
  trackingToken: string;
  customerPhone: string;
  customerName: string;
  bancaCode: string;
  bancaName: string;
  driverCode?: string;
  driverName?: string;
  driverPhone?: string;
  vehiclePlate?: string;
  missionState?: string;
  activeLeg?: string;
  driverLat?: string;
  driverLng?: string;
  pickupLat?: string;
  pickupLng?: string;
  pickupAddress?: string;
  destinationLat?: string;
  destinationLng?: string;
  destinationAddress?: string;
  distanceKm?: string;
  etaSeconds?: number;
  geofenceRadiusMeters?: number;
  insidePickupGeofence?: boolean;
  insideDestinationGeofence?: boolean;
  pickupPin: string;
  pickupQrToken: string;
  deliveryPin: string;
  deliveryQrToken: string;
  routeHistoryJson?: string;
  failureReason?: string | null;
}) {
  try {
    const rows = await db
      .insert(deliveryMissions)
      .values({
        orderCode: data.orderCode,
        trackingToken: data.trackingToken,
        customerPhone: data.customerPhone,
        customerName: data.customerName,
        bancaCode: data.bancaCode,
        bancaName: data.bancaName,
        driverCode: data.driverCode ?? 'EST-019',
        driverName: data.driverName ?? 'Paulo Sebastião',
        driverPhone: data.driverPhone ?? '+244 931 880 210',
        vehiclePlate: data.vehiclePlate ?? 'LD-44-92-AO',
        missionState: data.missionState ?? 'GOING_TO_PICKUP',
        activeLeg: data.activeLeg ?? 'PICKUP',
        driverLat: data.driverLat ?? '-8.8159',
        driverLng: data.driverLng ?? '13.2291',
        pickupLat: data.pickupLat ?? '-8.8147',
        pickupLng: data.pickupLng ?? '13.2302',
        pickupAddress: data.pickupAddress ?? 'Praça dos Correios · Ingombota, Luanda',
        destinationLat: data.destinationLat ?? '-8.8295',
        destinationLng: data.destinationLng ?? '13.2348',
        destinationAddress: data.destinationAddress ?? 'Largo da Maianga, Luanda',
        distanceKm: data.distanceKm ?? '0.22',
        etaSeconds: data.etaSeconds ?? 95,
        geofenceRadiusMeters: data.geofenceRadiusMeters ?? 120,
        insidePickupGeofence: data.insidePickupGeofence ?? false,
        insideDestinationGeofence: data.insideDestinationGeofence ?? false,
        pickupPin: data.pickupPin,
        pickupQrToken: data.pickupQrToken,
        deliveryPin: data.deliveryPin,
        deliveryQrToken: data.deliveryQrToken,
        routeHistoryJson: data.routeHistoryJson ?? '[]',
        failureReason: data.failureReason ?? null,
      })
      .onConflictDoUpdate({
        target: deliveryMissions.orderCode,
        set: {
          ...(data.missionState !== undefined ? { missionState: data.missionState } : {}),
          ...(data.activeLeg !== undefined ? { activeLeg: data.activeLeg } : {}),
          ...(data.driverLat !== undefined ? { driverLat: data.driverLat } : {}),
          ...(data.driverLng !== undefined ? { driverLng: data.driverLng } : {}),
          ...(data.destinationLat !== undefined ? { destinationLat: data.destinationLat } : {}),
          ...(data.destinationLng !== undefined ? { destinationLng: data.destinationLng } : {}),
          ...(data.destinationAddress !== undefined
            ? { destinationAddress: data.destinationAddress }
            : {}),
          ...(data.distanceKm !== undefined ? { distanceKm: data.distanceKm } : {}),
          ...(data.etaSeconds !== undefined ? { etaSeconds: data.etaSeconds } : {}),
          ...(data.insidePickupGeofence !== undefined
            ? { insidePickupGeofence: data.insidePickupGeofence }
            : {}),
          ...(data.insideDestinationGeofence !== undefined
            ? { insideDestinationGeofence: data.insideDestinationGeofence }
            : {}),
          ...(data.routeHistoryJson !== undefined
            ? { routeHistoryJson: data.routeHistoryJson }
            : {}),
          ...(data.failureReason !== undefined ? { failureReason: data.failureReason } : {}),
          updatedAt: new Date(),
        },
      })
      .returning();
    return rows[0];
  } catch (error) {
    console.error('Database query failed in upsertDeliveryMissionRecord:', error);
    throw new Error('Failed to upsert delivery mission.', { cause: error });
  }
}

export async function updateDeliveryMissionFields(
  orderCode: string,
  updates: Partial<{
    missionState: string;
    activeLeg: string;
    driverCode: string;
    driverName: string;
    driverPhone: string;
    vehiclePlate: string;
    driverLat: string;
    driverLng: string;
    pickupLat: string;
    pickupLng: string;
    pickupAddress: string;
    destinationLat: string;
    destinationLng: string;
    destinationAddress: string;
    distanceKm: string;
    etaSeconds: number;
    insidePickupGeofence: boolean;
    insideDestinationGeofence: boolean;
    routeHistoryJson: string;
    failureReason: string | null;
  }>
) {
  try {
    const rows = await db
      .update(deliveryMissions)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(deliveryMissions.orderCode, orderCode))
      .returning();
    return rows[0] ?? null;
  } catch (error) {
    console.error('Database query failed in updateDeliveryMissionFields:', error);
    throw new Error('Failed to update delivery mission fields.', { cause: error });
  }
}

export async function listDeliveryTrackingEventsRecords(orderCode?: string) {
  try {
    const rows = orderCode
      ? await db
          .select()
          .from(deliveryTrackingEvents)
          .where(eq(deliveryTrackingEvents.orderCode, orderCode))
          .orderBy(desc(deliveryTrackingEvents.id))
      : await db.select().from(deliveryTrackingEvents).orderBy(desc(deliveryTrackingEvents.id));
    return rows;
  } catch (error) {
    console.error('Database query failed in listDeliveryTrackingEventsRecords:', error);
    return [];
  }
}

export async function createDeliveryTrackingEventRecord(data: {
  orderCode: string;
  driverCode?: string;
  previousState?: string | null;
  newState: string;
  actorRole: string;
  verificationMethod?: string;
  lat: string;
  lng: string;
  distanceToTargetMeters?: number;
  description: string;
}) {
  try {
    const eventCode = `EVT-${Date.now().toString().slice(-5)}-${Math.floor(10 + Math.random() * 89)}`;
    const rows = await db
      .insert(deliveryTrackingEvents)
      .values({
        eventCode,
        orderCode: data.orderCode,
        driverCode: data.driverCode ?? 'EST-019',
        previousState: data.previousState ?? null,
        newState: data.newState,
        actorRole: data.actorRole,
        verificationMethod: data.verificationMethod ?? 'GPS_TELEMETRY',
        lat: data.lat,
        lng: data.lng,
        distanceToTargetMeters: data.distanceToTargetMeters ?? 0,
        description: data.description,
      })
      .returning();
    return rows[0];
  } catch (error) {
    console.error('Database query failed in createDeliveryTrackingEventRecord:', error);
    return null;
  }
}

export interface KitingoPostgisDeliveryRecord {
  id: string;
  orderId: string;
  driverId: string;
  customerId: string;
  merchantId: string;
  orderCode: string;
  driverCode: string;
  driverName: string;
  driverPhone: string;
  vehiclePlate: string;
  customerName: string;
  customerPhone: string;
  bancaCode: string;
  bancaName: string;
  pickupAddress: string;
  destinationAddress: string;
  pickupWkt: string;
  destinationWkt: string;
  driverWkt: string | null;
  pickupLat: number;
  pickupLng: number;
  destinationLat: number;
  destinationLng: number;
  driverLat: number;
  driverLng: number;
  status: string;
  estimatedDistanceMeters: number;
  estimatedDurationSeconds: number;
  postgisDistanceToPickupMeters: number;
  postgisDistanceToDestinationMeters: number;
  pickupOtp: string;
  deliveryOtp: string;
  isOtpVerified: boolean;
  updatedAt: string;
}

export async function syncKitingoPostgisDelivery(mission: {
  orderCode: string;
  driverCode?: string;
  driverName?: string;
  driverPhone?: string;
  vehiclePlate?: string;
  customerName?: string;
  customerPhone?: string;
  bancaCode?: string;
  bancaName?: string;
  pickupAddress?: string;
  destinationAddress?: string;
  pickupLat: number | string;
  pickupLng: number | string;
  destinationLat: number | string;
  destinationLng: number | string;
  driverLat: number | string;
  driverLng: number | string;
  status: string;
  estimatedDistanceMeters?: number;
  estimatedDurationSeconds?: number;
  pickupOtp: string;
  deliveryOtp: string;
  isOtpVerified?: boolean;
  routeHistoryJson?: string;
}) {
  try {
    const pLat = Number(mission.pickupLat) || -8.8147;
    const pLng = Number(mission.pickupLng) || 13.2302;
    const dLat = Number(mission.destinationLat) || -8.8295;
    const dLng = Number(mission.destinationLng) || 13.2348;
    const cLat = Number(mission.driverLat) || -8.8168;
    const cLng = Number(mission.driverLng) || 13.2284;
    const distMeters = mission.estimatedDistanceMeters ?? 350;
    const durSeconds = mission.estimatedDurationSeconds ?? 140;
    const verified =
      mission.isOtpVerified ??
      ['PICKUP_CONFIRMED', 'GOING_TO_DESTINATION', 'ARRIVED_AT_DESTINATION', 'DELIVERY_CONFIRMED'].includes(
        mission.status
      );

    await db.execute(sql`
      INSERT INTO kitingo_deliveries (
        order_code, driver_code, driver_name, driver_phone, vehicle_plate,
        customer_name, customer_phone, banca_code, banca_name,
        pickup_address, destination_address,
        pickup_location, destination_location, current_driver_location,
        status, estimated_distance_meters, estimated_duration_seconds,
        pickup_otp, delivery_otp, is_otp_verified, route_history_json, updated_at
      ) VALUES (
        ${mission.orderCode},
        ${mission.driverCode ?? 'EST-019'},
        ${mission.driverName ?? 'Paulo Sebastião'},
        ${mission.driverPhone ?? '+244 931 880 210'},
        ${mission.vehiclePlate ?? 'LD-44-92-AO'},
        ${mission.customerName ?? 'João Manuel Baptista'},
        ${mission.customerPhone ?? '+244 924 514 042'},
        ${mission.bancaCode ?? 'PC-008'},
        ${mission.bancaName ?? 'Banca #08 - Peças do Zé'},
        ${mission.pickupAddress ?? 'Praça dos Correios · Banca #08, Ingombota'},
        ${mission.destinationAddress ?? 'Largo da Maianga, Luanda'},
        ST_SetSRID(ST_MakePoint(${pLng}, ${pLat}), 4326),
        ST_SetSRID(ST_MakePoint(${dLng}, ${dLat}), 4326),
        ST_SetSRID(ST_MakePoint(${cLng}, ${cLat}), 4326),
        ${mission.status}::delivery_state,
        ${distMeters},
        ${durSeconds},
        ${String(mission.pickupOtp).slice(0, 4)},
        ${String(mission.deliveryOtp).slice(0, 4)},
        ${verified},
        ${mission.routeHistoryJson ?? '[]'},
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (order_code) DO UPDATE SET
        pickup_location = ST_SetSRID(ST_MakePoint(${pLng}, ${pLat}), 4326),
        destination_location = ST_SetSRID(ST_MakePoint(${dLng}, ${dLat}), 4326),
        current_driver_location = ST_SetSRID(ST_MakePoint(${cLng}, ${cLat}), 4326),
        status = ${mission.status}::delivery_state,
        estimated_distance_meters = ${distMeters},
        estimated_duration_seconds = ${durSeconds},
        is_otp_verified = ${verified},
        route_history_json = ${mission.routeHistoryJson ?? '[]'},
        updated_at = CURRENT_TIMESTAMP
    `);
  } catch (error) {
    console.error('Database query failed in syncKitingoPostgisDelivery:', error);
  }
}

export async function listKitingoPostgisDeliveries(
  orderCode?: string
): Promise<KitingoPostgisDeliveryRecord[]> {
  try {
    const queryResult = orderCode
      ? await db.execute(sql`
          SELECT
            id,
            order_id,
            driver_id,
            customer_id,
            merchant_id,
            order_code,
            driver_code,
            driver_name,
            driver_phone,
            vehicle_plate,
            customer_name,
            customer_phone,
            banca_code,
            banca_name,
            pickup_address,
            destination_address,
            ST_AsText(pickup_location) AS pickup_wkt,
            ST_AsText(destination_location) AS destination_wkt,
            ST_AsText(current_driver_location) AS driver_wkt,
            ST_Y(pickup_location) AS pickup_lat,
            ST_X(pickup_location) AS pickup_lng,
            ST_Y(destination_location) AS destination_lat,
            ST_X(destination_location) AS destination_lng,
            COALESCE(ST_Y(current_driver_location), ST_Y(pickup_location)) AS driver_lat,
            COALESCE(ST_X(current_driver_location), ST_X(pickup_location)) AS driver_lng,
            status::text AS status,
            COALESCE(estimated_distance_meters, 0) AS estimated_distance_meters,
            COALESCE(estimated_duration_seconds, 0) AS estimated_duration_seconds,
            COALESCE(ROUND(ST_DistanceSphere(current_driver_location, pickup_location))::int, 0) AS postgis_dist_pickup_m,
            COALESCE(ROUND(ST_DistanceSphere(current_driver_location, destination_location))::int, 0) AS postgis_dist_dest_m,
            pickup_otp,
            delivery_otp,
            COALESCE(is_otp_verified, false) AS is_otp_verified,
            updated_at
          FROM kitingo_deliveries
          WHERE order_code = ${orderCode}
          ORDER BY updated_at DESC
        `)
      : await db.execute(sql`
          SELECT
            id,
            order_id,
            driver_id,
            customer_id,
            merchant_id,
            order_code,
            driver_code,
            driver_name,
            driver_phone,
            vehicle_plate,
            customer_name,
            customer_phone,
            banca_code,
            banca_name,
            pickup_address,
            destination_address,
            ST_AsText(pickup_location) AS pickup_wkt,
            ST_AsText(destination_location) AS destination_wkt,
            ST_AsText(current_driver_location) AS driver_wkt,
            ST_Y(pickup_location) AS pickup_lat,
            ST_X(pickup_location) AS pickup_lng,
            ST_Y(destination_location) AS destination_lat,
            ST_X(destination_location) AS destination_lng,
            COALESCE(ST_Y(current_driver_location), ST_Y(pickup_location)) AS driver_lat,
            COALESCE(ST_X(current_driver_location), ST_X(pickup_location)) AS driver_lng,
            status::text AS status,
            COALESCE(estimated_distance_meters, 0) AS estimated_distance_meters,
            COALESCE(estimated_duration_seconds, 0) AS estimated_duration_seconds,
            COALESCE(ROUND(ST_DistanceSphere(current_driver_location, pickup_location))::int, 0) AS postgis_dist_pickup_m,
            COALESCE(ROUND(ST_DistanceSphere(current_driver_location, destination_location))::int, 0) AS postgis_dist_dest_m,
            pickup_otp,
            delivery_otp,
            COALESCE(is_otp_verified, false) AS is_otp_verified,
            updated_at
          FROM kitingo_deliveries
          ORDER BY updated_at DESC
        `);

    const rawRows = Array.isArray((queryResult as { rows?: unknown[] }).rows)
      ? ((queryResult as { rows: Record<string, unknown>[] }).rows ?? [])
      : (Array.isArray(queryResult) ? (queryResult as Record<string, unknown>[]) : []);

    return rawRows.map((row) => ({
      id: String(row.id ?? ''),
      orderId: String(row.order_id ?? ''),
      driverId: String(row.driver_id ?? ''),
      customerId: String(row.customer_id ?? ''),
      merchantId: String(row.merchant_id ?? ''),
      orderCode: String(row.order_code ?? 'CE-650018'),
      driverCode: String(row.driver_code ?? 'EST-019'),
      driverName: String(row.driver_name ?? 'Paulo Sebastião'),
      driverPhone: String(row.driver_phone ?? '+244 931 880 210'),
      vehiclePlate: String(row.vehicle_plate ?? 'LD-44-92-AO'),
      customerName: String(row.customer_name ?? 'João Manuel Baptista'),
      customerPhone: String(row.customer_phone ?? '+244 924 514 042'),
      bancaCode: String(row.banca_code ?? 'PC-008'),
      bancaName: String(row.banca_name ?? 'Banca #08 - Peças do Zé'),
      pickupAddress: String(row.pickup_address ?? 'Praça dos Correios · Ingombota'),
      destinationAddress: String(row.destination_address ?? 'Largo da Maianga, Luanda'),
      pickupWkt: String(row.pickup_wkt ?? 'POINT(13.2302 -8.8147)'),
      destinationWkt: String(row.destination_wkt ?? 'POINT(13.2348 -8.8295)'),
      driverWkt: row.driver_wkt ? String(row.driver_wkt) : null,
      pickupLat: Number(row.pickup_lat ?? -8.8147),
      pickupLng: Number(row.pickup_lng ?? 13.2302),
      destinationLat: Number(row.destination_lat ?? -8.8295),
      destinationLng: Number(row.destination_lng ?? 13.2348),
      driverLat: Number(row.driver_lat ?? -8.8168),
      driverLng: Number(row.driver_lng ?? 13.2284),
      status: String(row.status ?? 'GOING_TO_PICKUP'),
      estimatedDistanceMeters: Number(row.estimated_distance_meters ?? 350),
      estimatedDurationSeconds: Number(row.estimated_duration_seconds ?? 140),
      postgisDistanceToPickupMeters: Number(row.postgis_dist_pickup_m ?? 0),
      postgisDistanceToDestinationMeters: Number(row.postgis_dist_dest_m ?? 0),
      pickupOtp: String(row.pickup_otp ?? '0018'),
      deliveryOtp: String(row.delivery_otp ?? '2437'),
      isOtpVerified: Boolean(row.is_otp_verified),
      updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : new Date().toISOString(),
    }));
  } catch (error) {
    console.error('Database query failed in listKitingoPostgisDeliveries:', error);
    return [];
  }
}






