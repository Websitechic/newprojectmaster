
-- Add new columns to support mention tracking
ALTER TABLE communication_delays 
ADD COLUMN IF NOT EXISTS mention_message_id INTEGER REFERENCES project_messages(id),
ADD COLUMN IF NOT EXISTS delay_type VARCHAR(50) DEFAULT 'general_delay',
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_communication_delays_mention_message 
ON communication_delays(mention_message_id);

CREATE INDEX IF NOT EXISTS idx_communication_delays_type 
ON communication_delays(delay_type);
