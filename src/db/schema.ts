import { relations } from 'drizzle-orm';
import {
  boolean,
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

const postgisPoint = customType<{ data: string }>({
  dataType() {
    return 'geometry(Point, 4326)';
  },
});

export const deliveryStateEnum = pgEnum('delivery_state', [
  'WAITING_FOR_DRIVER',
  'DRIVER_ASSIGNED',
  'GOING_TO_PICKUP',
  'ARRIVED_AT_PICKUP',
  'PICKUP_CONFIRMED',
  'GOING_TO_DESTINATION',
  'ARRIVED_AT_DESTINATION',
  'DELIVERY_CONFIRMED',
  'DELIVERY_FAILED',
  'CANCELLED',
]);

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID or Kitingo Identity UID
  email: text('email').notNull(),
  phone: text('phone'), // e.g. +244 923 456 789
  fullName: text('full_name'),
  role: text('role').notNull().default('cliente'), // 'cliente' | 'vendedor' | 'estafeta' | 'admin' | 'supervisor' | 'suporte'
  bancaCode: text('banca_code'), // e.g. PC-042
  bancaName: text('banca_name'),
  bancaSector: text('banca_sector'),
  vehicleType: text('vehicle_type'),
  vehiclePlate: text('vehicle_plate'),
  pinHash: text('pin_hash'), // 4-digit PIN hash
  twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
  verified: boolean('verified').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

export const bancaRegistry = pgTable('banca_registry', {
  id: serial('id').primaryKey(),
  bancaCode: text('banca_code').notNull().unique(), // e.g. PC-042
  ownerUid: text('owner_uid').notNull(),
  ownerName: text('owner_name'),
  ownerPhone: text('owner_phone'),
  bancaName: text('banca_name').notNull(),
  sector: text('sector').notNull(),
  nif: text('nif'),
  status: text('status').notNull().default('ativa'), // 'ativa' | 'suspensa' | 'bloqueada_fraude' | 'pendente'
  fraudReason: text('fraud_reason'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const otpChallenges = pgTable('otp_challenges', {
  id: serial('id').primaryKey(),
  identifier: text('identifier').notNull(), // phone (+244...) or email
  channel: text('channel').notNull(), // 'sms_otp' | 'pin_recovery' | 'enterprise_2fa'
  profileRole: text('profile_role').notNull(),
  code: text('code').notNull(),
  attempts: integer('attempts').notNull().default(0),
  consumed: boolean('consumed').notNull().default(false),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const authAuditLogs = pgTable('auth_audit_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  actorIdentifier: text('actor_identifier').notNull(),
  eventType: text('event_type').notNull(),
  portal: text('portal').notNull(), // 'mobile' | 'enterprise'
  metadata: text('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const customerOrders = pgTable('customer_orders', {
  id: serial('id').primaryKey(),
  orderCode: text('order_code').notNull().unique(), // e.g. CE-482910
  customerName: text('customer_name'),
  customerPhone: text('customer_phone'),
  location: text('location'),
  entity: text('entity').notNull(), // 10116
  reference: text('reference').notNull(), // 123 456 789
  amount: integer('amount').notNull(), // Total in Kz
  itemCount: integer('item_count').notNull(),
  itemsJson: text('items_json').notNull(), // JSON serialized CartLine items
  status: text('status').notNull().default('aguarda_pagamento'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const sampleMatches = pgTable('sample_matches', {
  id: serial('id').primaryKey(),
  matchCode: text('match_code').notNull().unique(), // e.g. MA-9042
  customerName: text('customer_name'),
  customerPhone: text('customer_phone'),
  vehicleModel: text('vehicle_model').notNull(),
  vehicleYear: text('vehicle_year').notNull(),
  partNotes: text('part_notes'),
  preferredCondition: text('preferred_condition').notNull().default('Todos'),
  photosJson: text('photos_json').notNull(), // JSON array of 2-3 photo URLs/dataURIs
  status: text('status').notNull().default('na_fila_bancas'), // 'na_fila_bancas' | 'cotacao_recebida' | 'rejeitado'
  vendorQuotesJson: text('vendor_quotes_json'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const merchantInventory = pgTable('merchant_inventory', {
  id: serial('id').primaryKey(),
  partCode: text('part_code').notNull().unique(),
  bancaCode: text('banca_code').notNull(), // e.g. Banca #08 / PC-008
  bancaName: text('banca_name').notNull(), // e.g. Banca #08 - Peças do Zé
  name: text('name').notNull(),
  category: text('category').notNull(), // Motor, Alternador, Arranque, Suspensão, etc.
  compatibility: text('compatibility').notNull(),
  condition: text('condition').notNull().default('nova'), // 'nova' | 'ocasiao'
  conditionGrade: text('condition_grade').notNull().default('Na Caixa'), // 'Na Caixa' | 'Grau A' | 'Grau B'
  brand: text('brand').notNull(),
  warrantyLabel: text('warranty_label').notNull(),
  price: integer('price').notNull(),
  inStock: integer('in_stock').notNull().default(1),
  image: text('image').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const merchantPayouts = pgTable('merchant_payouts', {
  id: serial('id').primaryKey(),
  payoutCode: text('payout_code').notNull().unique(), // e.g. SP-8841
  orderCode: text('order_code').notNull(),
  bancaCode: text('banca_code').notNull(),
  bancaName: text('banca_name').notNull(),
  driverName: text('driver_name').notNull(),
  handoverOtp: text('handover_otp').notNull(),
  grossAmount: integer('gross_amount').notNull(),
  platformSplitAmount: integer('platform_split_amount').notNull(),
  netBancaAmount: integer('net_banca_amount').notNull(),
  status: text('status').notNull().default('liquidado'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const logisticsDrivers = pgTable('logistics_drivers', {
  id: serial('id').primaryKey(),
  driverCode: text('driver_code').notNull().unique(), // e.g. EST-019
  fullName: text('full_name').notNull(),
  phone: text('phone').notNull(),
  nif: text('nif'),
  vehicleType: text('vehicle_type').notNull(),
  vehiclePlate: text('vehicle_plate').notNull(),
  zone: text('zone').notNull().default('Praça dos Correios -> Maianga'),
  status: text('status').notNull().default('em_rota'), // 'em_rota' | 'disponivel' | 'offline'
  speedKmh: integer('speed_kmh').notNull().default(36),
  batteryLevel: integer('battery_level').notNull().default(88),
  activeOrderCode: text('active_order_code'),
  lat: text('lat').notNull().default('-8.8185'),
  lng: text('lng').notNull().default('13.2325'),
  currentStreet: text('current_street').notNull().default('Av. Ho Chi Minh · Ingombota'),
  deliveriesToday: integer('deliveries_today').notNull().default(0),
  otpSuccessRate: text('otp_success_rate').notNull().default('100%'),
  licenseDocUrl: text('license_doc_url'),
  idDocUrl: text('id_doc_url'),
  vehicleDocUrl: text('vehicle_doc_url'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const logisticsSettlements = pgTable('logistics_settlements', {
  id: serial('id').primaryKey(),
  settlementCode: text('settlement_code').notNull().unique(), // e.g. LQ-2026-W45
  periodLabel: text('period_label').notNull(),
  deliveriesCount: integer('deliveries_count').notNull(),
  grossOrderVolumeKz: integer('gross_order_volume_kz').notNull(),
  transportFeeTotalKz: integer('transport_fee_total_kz').notNull(),
  escrowBonusKz: integer('escrow_bonus_kz').notNull().default(0),
  netPartnerPayoutKz: integer('net_partner_payout_kz').notNull(),
  bankReference: text('bank_reference').notNull(),
  status: text('status').notNull().default('liquidado'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const supportTickets = pgTable('support_tickets', {
  id: serial('id').primaryKey(),
  ticketCode: text('ticket_code').notNull().unique(), // e.g. TK-4091
  customerName: text('customer_name').notNull(),
  customerPhone: text('customer_phone').notNull(),
  orderCode: text('order_code'),
  matchCode: text('match_code'),
  bancaCode: text('banca_code').notNull(),
  bancaName: text('banca_name').notNull(),
  subject: text('subject').notNull(),
  priority: text('priority').notNull().default('alta'), // 'urgente' | 'alta' | 'normal'
  status: text('status').notNull().default('em_mediacao'), // 'aberto' | 'em_mediacao' | 'resolvido'
  vehicleModel: text('vehicle_model').notNull(),
  clientSamplePhotoUrl: text('client_sample_photo_url').notNull(),
  clientPartDescription: text('client_part_description').notNull(),
  merchantOfferPhotoUrl: text('merchant_offer_photo_url').notNull(),
  merchantOfferPartName: text('merchant_offer_part_name').notNull(),
  merchantOfferCondition: text('merchant_offer_condition').notNull().default('ocasiao'),
  merchantOfferPriceKz: integer('merchant_offer_price_kz').notNull(),
  chatMessagesJson: text('chat_messages_json').notNull(), // JSON array of chat messages
  assignedStaffId: text('assigned_staff_id').notNull().default('CCA-029'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const financialSplitAudits = pgTable('financial_split_audits', {
  id: serial('id').primaryKey(),
  splitCode: text('split_code').notNull().unique(), // e.g. SPL-2026-8841
  orderCode: text('order_code').notNull(),
  bancaCode: text('banca_code').notNull(),
  bancaName: text('banca_name').notNull(),
  bancaNif: text('banca_nif').notNull(),
  bankName: text('bank_name').notNull().default('BAI'), // 'BAI' | 'BCI'
  ibanMasked: text('iban_masked').notNull(),
  grossAmountKz: integer('gross_amount_kz').notNull(),
  merchantNetKz: integer('merchant_net_kz').notNull(),
  platformFeeKz: integer('platform_fee_kz').notNull(),
  logisticsFeeKz: integer('logistics_fee_kz').notNull(),
  agtTaxWithheldKz: integer('agt_tax_withheld_kz').notNull(),
  status: text('status').notNull().default('liquidado'), // 'liquidado' | 'split_pendente' | 'excecao_bancaria'
  failureReason: text('failure_reason'),
  bankTransactionRef: text('bank_transaction_ref').notNull(),
  reprocessedByStaffId: text('reprocessed_by_staff_id'),
  reprocessedAt: timestamp('reprocessed_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const adminAuditTrails = pgTable('admin_audit_trails', {
  id: serial('id').primaryKey(),
  auditCode: text('audit_code').notNull().unique(), // e.g. AUD-90412
  staffId: text('staff_id').notNull(), // e.g. ADM-001, SUP-014, CCA-029
  staffName: text('staff_name').notNull(),
  staffRole: text('staff_role').notNull(), // 'super_admin' | 'field_supervisor' | 'call_center'
  actionType: text('action_type').notNull(),
  targetEntity: text('target_entity').notNull(), // 'BANCA' | 'SPLIT_BAI_BCI' | 'GPS_FLEET' | 'CALL_CENTER' | 'RBAC'
  targetCode: text('target_code').notNull(),
  severity: text('severity').notNull().default('info'), // 'info' | 'warning' | 'critical'
  details: text('details').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const deliveryMissions = pgTable('delivery_missions', {
  id: serial('id').primaryKey(),
  orderCode: text('order_code').notNull().unique(), // e.g. CE-650018
  trackingToken: text('tracking_token').notNull(), // Customer isolation token
  customerPhone: text('customer_phone').notNull(),
  customerName: text('customer_name').notNull(),
  bancaCode: text('banca_code').notNull(),
  bancaName: text('banca_name').notNull(),
  driverCode: text('driver_code').notNull().default('EST-019'),
  driverName: text('driver_name').notNull().default('Paulo Sebastião'),
  driverPhone: text('driver_phone').notNull().default('+244 931 880 210'),
  vehiclePlate: text('vehicle_plate').notNull().default('LD-44-92-AO'),
  missionState: text('mission_state').notNull().default('GOING_TO_PICKUP'), // WAITING_FOR_DRIVER | DRIVER_ASSIGNED | GOING_TO_PICKUP | ARRIVED_AT_PICKUP | PICKUP_CONFIRMED | GOING_TO_DESTINATION | ARRIVED_AT_DESTINATION | DELIVERY_CONFIRMED | DELIVERY_FAILED | CANCELLED
  activeLeg: text('active_leg').notNull().default('PICKUP'), // 'PICKUP' | 'DESTINATION'
  driverLat: text('driver_lat').notNull().default('-8.8168'),
  driverLng: text('driver_lng').notNull().default('13.2284'),
  pickupLat: text('pickup_lat').notNull().default('-8.8147'),
  pickupLng: text('pickup_lng').notNull().default('13.2302'),
  pickupAddress: text('pickup_address').notNull().default('Praça dos Correios · Banca #08, Ingombota'),
  destinationLat: text('destination_lat').notNull().default('-8.8295'),
  destinationLng: text('destination_lng').notNull().default('13.2348'),
  destinationAddress: text('destination_address').notNull().default('Largo da Maianga, Luanda'),
  distanceKm: text('distance_km').notNull().default('0.35'),
  etaSeconds: integer('eta_seconds').notNull().default(140),
  geofenceRadiusMeters: integer('geofence_radius_meters').notNull().default(120),
  insidePickupGeofence: boolean('inside_pickup_geofence').notNull().default(false),
  insideDestinationGeofence: boolean('inside_destination_geofence').notNull().default(false),
  pickupPin: text('pickup_pin').notNull().default('0018'),
  pickupQrToken: text('pickup_qr_token').notNull().default('KT-PICKUP-CE-650018-0018'),
  deliveryPin: text('delivery_pin').notNull().default('2437'),
  deliveryQrToken: text('delivery_qr_token').notNull().default('KT-DELIV-CE-650018-2437'),
  routeHistoryJson: text('route_history_json').notNull().default('[]'),
  failureReason: text('failure_reason'),
  updatedAt: timestamp('updated_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const deliveryTrackingEvents = pgTable('delivery_tracking_events', {
  id: serial('id').primaryKey(),
  eventCode: text('event_code').notNull().unique(),
  orderCode: text('order_code').notNull(),
  driverCode: text('driver_code').notNull().default('EST-019'),
  previousState: text('previous_state'),
  newState: text('new_state').notNull(),
  actorRole: text('actor_role').notNull(), // 'estafeta' | 'vendedor' | 'cliente' | 'geofence' | 'admin'
  verificationMethod: text('verification_method').notNull().default('GPS_TELEMETRY'), // 'GPS_TELEMETRY' | 'GEOFENCE_AUTO' | 'PIN_OTP' | 'QR_CODE' | 'DISPATCH'
  lat: text('lat').notNull(),
  lng: text('lng').notNull(),
  distanceToTargetMeters: integer('distance_to_target_meters').notNull().default(0),
  description: text('description').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const kitingoDeliveries = pgTable(
  'kitingo_deliveries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id').notNull().defaultRandom(),
    driverId: uuid('driver_id').notNull().defaultRandom(),
    customerId: uuid('customer_id').notNull().defaultRandom(),
    merchantId: uuid('merchant_id').notNull().defaultRandom(),

    // Identificadores operacionais Kitingo
    orderCode: text('order_code').notNull().unique(),
    driverCode: text('driver_code').notNull().default('EST-019'),
    driverName: text('driver_name').notNull().default('Paulo Sebastião'),
    driverPhone: text('driver_phone').notNull().default('+244 931 880 210'),
    vehiclePlate: text('vehicle_plate').notNull().default('LD-44-92-AO'),
    customerName: text('customer_name').notNull().default('João Manuel Baptista'),
    customerPhone: text('customer_phone').notNull().default('+244 924 514 042'),
    bancaCode: text('banca_code').notNull().default('PC-008'),
    bancaName: text('banca_name').notNull().default('Banca #08 - Peças do Zé'),
    pickupAddress: text('pickup_address').notNull().default('Praça dos Correios · Corredor Central'),
    destinationAddress: text('destination_address').notNull().default('Largo da Maianga, Luanda'),

    // Coordenadas espaciais (PostGIS Points: Longitude, Latitude — SRID 4326)
    pickupLocation: postgisPoint('pickup_location').notNull(),
    destinationLocation: postgisPoint('destination_location').notNull(),
    currentDriverLocation: postgisPoint('current_driver_location'),

    // Estado atual da entrega (delivery_state ENUM)
    status: deliveryStateEnum('status').notNull().default('WAITING_FOR_DRIVER'),

    // Métricas de rota
    estimatedDistanceMeters: integer('estimated_distance_meters'),
    estimatedDurationSeconds: integer('estimated_duration_seconds'),

    // Segurança e Confirmação
    pickupOtp: varchar('pickup_otp', { length: 4 }).notNull(),
    deliveryOtp: varchar('delivery_otp', { length: 4 }).notNull(),
    isOtpVerified: boolean('is_otp_verified').default(false),
    routeHistoryJson: text('route_history_json').notNull().default('[]'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [index('idx_deliveries_status').on(table.status)]
);

export const usersRelations = relations(users, ({ many }) => ({
  auditLogs: many(authAuditLogs),
}));

export const authAuditLogsRelations = relations(authAuditLogs, ({ one }) => ({
  user: one(users, {
    fields: [authAuditLogs.userId],
    references: [users.id],
  }),
}));





