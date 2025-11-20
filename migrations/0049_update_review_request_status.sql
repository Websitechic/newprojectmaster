
-- Update review_requests status enum to include resolved and closed
ALTER TABLE review_requests DROP CONSTRAINT IF EXISTS review_requests_status_check;
ALTER TABLE review_requests ADD CONSTRAINT review_requests_status_check CHECK (status IN ('pending', 'in_review', 'resolved', 'closed'));
