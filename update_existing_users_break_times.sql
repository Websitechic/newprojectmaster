-- Set break times for existing users as specified
UPDATE users SET break_one_time = '22:00', break_two_time = '12:00' WHERE username = 'testpm';
UPDATE users SET break_one_time = '12:30', break_two_time = '15:00' WHERE username = 'testuser';
UPDATE users SET break_one_time = '13:00', break_two_time = '16:00' WHERE username = 'Staff1';
