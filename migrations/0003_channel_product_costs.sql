CREATE TABLE IF NOT EXISTS channel_product_costs (channel TEXT NOT NULL, sku TEXT NOT NULL, cost_halalas INTEGER NOT NULL CHECK(cost_halalas>=0), updated_at TEXT NOT NULL, PRIMARY KEY(channel,sku));
