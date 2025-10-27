
-- Delete specific user accounts
-- This script will remove users with the following names:
-- "Mgwin", "Msan", "Dummy client", "Mbuki", "Idorenyin Francis"

-- First, let's see which users match these names (case-insensitive and flexible matching)
SELECT id, name, email, role FROM users 
WHERE LOWER(TRIM(name)) IN (
  LOWER('Mgwin'), 
  LOWER('Msan'), 
  LOWER('Dummy client'), 
  LOWER('Mbuki'), 
  LOWER('Idorenyin Francis')
)
OR LOWER(name) LIKE LOWER('%Mgwin%')
OR LOWER(name) LIKE LOWER('%Msan%')
OR LOWER(name) LIKE LOWER('%Dummy client%')
OR LOWER(name) LIKE LOWER('%Mbuki%')
OR LOWER(name) LIKE LOWER('%Idorenyin Francis%');

-- Delete the users (this will cascade to related records due to foreign key constraints)
DELETE FROM users 
WHERE LOWER(TRIM(name)) IN (
  LOWER('Mgwin'), 
  LOWER('Msan'), 
  LOWER('Dummy client'), 
  LOWER('Mbuki'), 
  LOWER('Idorenyin Francis')
)
OR LOWER(name) LIKE LOWER('%Mgwin%')
OR LOWER(name) LIKE LOWER('%Msan%')
OR LOWER(name) LIKE LOWER('%Dummy client%')
OR LOWER(name) LIKE LOWER('%Mbuki%')
OR LOWER(name) LIKE LOWER('%Idorenyin Francis%');

-- Show confirmation
SELECT 'Deletion complete. Users with matching names have been removed.' AS status;
