
CREATE TABLE client_sentiment (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sentiment VARCHAR(20) NOT NULL CHECK (sentiment IN ('satisfied', 'dissatisfied', 'flags')),
    reason TEXT NOT NULL,
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(client_id, week_start)
);

-- Add index for efficient querying
CREATE INDEX idx_client_sentiment_week ON client_sentiment(week_start, week_end);
CREATE INDEX idx_client_sentiment_client ON client_sentiment(client_id);
CREATE INDEX idx_client_sentiment_sentiment ON client_sentiment(sentiment);
