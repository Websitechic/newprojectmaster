
-- Update user specializations
UPDATE users 
SET specialization = 'development' 
WHERE username = 'testuser';

UPDATE users 
SET specialization = 'automation' 
WHERE username = 'Staff1';

UPDATE users 
SET specialization = 'development' 
WHERE username = 'Dev1';

-- Verify the changes
SELECT username, specialization 
FROM users 
WHERE username IN ('testuser', 'Staff1', 'Dev1');
