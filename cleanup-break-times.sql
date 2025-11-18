
-- Clean up break time data to use only single break time
UPDATE users 
SET break_two_time = NULL 
WHERE break_two_time IS NOT NULL;

-- Verify the cleanup
SELECT username, role, break_one_time, break_two_time 
FROM users 
WHERE role != 'client' 
ORDER BY username;
