CREATE TABLE IF NOT EXISTS channel_commission_categories (
  channel TEXT NOT NULL,
  category TEXT NOT NULL,
  method TEXT NOT NULL,
  threshold_sar REAL NOT NULL DEFAULT 0 CHECK(threshold_sar >= 0),
  lower_rate REAL NOT NULL CHECK(lower_rate >= 0 AND lower_rate <= 1),
  upper_rate REAL NOT NULL CHECK(upper_rate >= 0 AND upper_rate <= 1),
  minimum_sar REAL NOT NULL DEFAULT 0 CHECK(minimum_sar >= 0),
  tiers TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL,
  PRIMARY KEY(channel, category)
);

CREATE TABLE IF NOT EXISTS channel_sku_categories (
  channel TEXT NOT NULL,
  sku TEXT NOT NULL,
  category TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  updated_at TEXT NOT NULL,
  PRIMARY KEY(channel, sku)
);
