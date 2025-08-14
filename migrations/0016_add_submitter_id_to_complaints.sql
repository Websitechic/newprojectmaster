
-- Add submitter_id column to complaints table
ALTER TABLE complaints ADD COLUMN submitter_id INTEGER REFERENCES users(id);

-- Update existing complaints to set submitter_id based on email if possible
UPDATE complaints 
SET submitter_id = users.id 
FROM users 
WHERE complaints.email = users.email;
