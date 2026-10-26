CREATE TABLE webhook_deliveries (
  source TEXT NOT NULL,
  delivery_id TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  PRIMARY KEY (source, delivery_id)
);
CREATE INDEX webhook_deliveries_expiry ON webhook_deliveries(expires_at);
