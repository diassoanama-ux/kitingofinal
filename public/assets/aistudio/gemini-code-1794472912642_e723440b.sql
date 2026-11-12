-- Extensão PostGIS para suporte geoespacial
CREATE EXTENSION IF NOT EXISTS postgis;

-- Enumeração dos estados operacionais da rota (Regra 4)
CREATE TYPE delivery_state AS ENUM (
    'WAITING_FOR_DRIVER',
    'DRIVER_ASSIGNED',
    'GOING_TO_PICKUP',
    'ARRIVED_AT_PICKUP',
    'PICKUP_CONFIRMED',
    'GOING_TO_DESTINATION',
    'ARRIVED_AT_DESTINATION',
    'DELIVERY_CONFIRMED',
    'DELIVERY_FAILED',
    'CANCELLED'
);

-- Tabela de Sessões de Navegação e Rastreio em Tempo Real
CREATE TABLE kitingo_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES drivers(id),
    customer_id UUID NOT NULL REFERENCES customers(id),
    merchant_id UUID NOT NULL REFERENCES merchants(id),
    
    -- Coordenadas espaciais (PostGIS Points: Longitude, Latitude)
    pickup_location GEOMETRY(Point, 4326) NOT NULL,
    destination_location GEOMETRY(Point, 4326) NOT NULL,
    current_driver_location GEOMETRY(Point, 4326),
    
    -- Estado atual da entrega
    status delivery_state NOT NULL DEFAULT 'WAITING_FOR_DRIVER',
    
    -- Métricas de rota
    estimated_distance_meters INT,
    estimated_duration_seconds INT,
    
    -- Segurança e Confirmação
    pickup_otp VARCHAR(4) NOT NULL,
    delivery_otp VARCHAR(4) NOT NULL,
    is_otp_verified BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices espaciais para alta performance de consulta em tempo real
CREATE INDEX idx_deliveries_driver_location ON kitingo_deliveries USING GIST (current_driver_location);
CREATE INDEX idx_deliveries_status ON kitingo_deliveries(status);