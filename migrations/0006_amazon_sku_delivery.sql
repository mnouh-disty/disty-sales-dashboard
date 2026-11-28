CREATE TABLE IF NOT EXISTS amazon_sku_delivery (sku TEXT PRIMARY KEY, fee_halalas INTEGER NOT NULL CHECK(fee_halalas>=0), updated_at TEXT NOT NULL);
