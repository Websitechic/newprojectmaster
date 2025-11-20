-- Update review_requests status column to use enum-like constraint
ALTER TABLE review_requests 
DROP CONSTRAINT IF EXISTS review_requests_status_check;

-- Update any 'resolved' status to 'closed'
UPDATE review_requests SET status = 'closed' WHERE status = 'resolved';

ALTER TABLE review_requests
ADD CONSTRAINT review_requests_status_check 
CHECK (status IN ('pending', 'in_review', 'closed'));