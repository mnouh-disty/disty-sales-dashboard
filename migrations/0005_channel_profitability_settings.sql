CREATE TABLE IF NOT EXISTS channel_profitability_settings (channel TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
INSERT OR IGNORE INTO channel_profitability_settings(channel,payload,updated_at) VALUES ('Trendyol','{"handling":125,"packaging":150,"returnRate":8,"salesVat":15,"purchaseVat":15,"purchaseRecovery":100}',CURRENT_TIMESTAMP);
