
-- Delete specific user accounts
-- This script will remove users with the following names:
-- "two Godwin", "two Olubukola", "Dummy client", "two Mike", "Idorenyin Francis"

-- First, let's see which users match these names
SELECT id, name, email, role FROM users 
WHERE name IN ('two Godwin', 'two Olubukola', 'Dummy client', 'two Mike', 'Idorenyin Francis');

-- Delete the users (uncomment the DELETE statement below after verifying the SELECT results)
-- DELETE FROM users 
-- WHERE name IN ('two Godwin', 'two Olubukola', 'Dummy client', 'two Mike', 'Idorenyin Francis');
