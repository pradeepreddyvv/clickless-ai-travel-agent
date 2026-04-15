-- ClickLess AI — Cached Data Tables for Dynamic Budget-Aware Queries
-- These tables store pre-seeded flight, hotel, and activity data
-- that can be queried dynamically based on user budget and preferences.

-- Cached Flights (queryable by price, destination, cabin class)
CREATE TABLE IF NOT EXISTS cached_flights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  destination_code TEXT NOT NULL,
  airline TEXT NOT NULL,
  departure_time TEXT,
  arrival_time TEXT,
  duration TEXT,
  stops INTEGER DEFAULT 0,
  price NUMERIC(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  cabin_class TEXT DEFAULT 'economy',
  booking_url TEXT,
  source TEXT DEFAULT 'cache',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Cached Hotels (queryable by price_per_night, rating, star_class)
CREATE TABLE IF NOT EXISTS cached_hotels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destination TEXT NOT NULL,
  name TEXT NOT NULL,
  rating NUMERIC(2,1) DEFAULT 0,
  price_per_night NUMERIC(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  neighborhood TEXT,
  amenities JSONB DEFAULT '[]',
  image_url TEXT,
  booking_url TEXT,
  star_class TEXT DEFAULT 'mid-range',
  source TEXT DEFAULT 'cache',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Cached Activities (queryable by category, cost, destination)
CREATE TABLE IF NOT EXISTS cached_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destination TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  estimated_cost NUMERIC(10,2) DEFAULT 0,
  duration TEXT,
  location TEXT,
  rating NUMERIC(2,1) DEFAULT 0,
  source TEXT DEFAULT 'cache',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast budget-filtered queries
CREATE INDEX IF NOT EXISTS idx_flights_dest ON cached_flights(destination);
CREATE INDEX IF NOT EXISTS idx_flights_price ON cached_flights(price);
CREATE INDEX IF NOT EXISTS idx_flights_cabin ON cached_flights(cabin_class);
CREATE INDEX IF NOT EXISTS idx_hotels_dest ON cached_hotels(destination);
CREATE INDEX IF NOT EXISTS idx_hotels_price ON cached_hotels(price_per_night);
CREATE INDEX IF NOT EXISTS idx_hotels_rating ON cached_hotels(rating DESC);
CREATE INDEX IF NOT EXISTS idx_hotels_class ON cached_hotels(star_class);
CREATE INDEX IF NOT EXISTS idx_activities_dest ON cached_activities(destination);
CREATE INDEX IF NOT EXISTS idx_activities_category ON cached_activities(category);
CREATE INDEX IF NOT EXISTS idx_activities_cost ON cached_activities(estimated_cost);

-- RLS: public read access for cached data
ALTER TABLE cached_flights ENABLE ROW LEVEL SECURITY;
ALTER TABLE cached_hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE cached_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read cached_flights" ON cached_flights FOR SELECT USING (true);
CREATE POLICY "Public read cached_hotels" ON cached_hotels FOR SELECT USING (true);
CREATE POLICY "Public read cached_activities" ON cached_activities FOR SELECT USING (true);
