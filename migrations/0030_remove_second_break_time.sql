
-- Migration to remove the requirement for second break time
-- Making breakTwoTime nullable since we only use one break time now

UPDATE users SET break_two_time = NULL WHERE break_two_time IS NOT NULL;

-- Add comment to indicate this field is deprecated
COMMENT ON COLUMN users.break_two_time IS 'DEPRECATED: No longer used. Only breakOneTime is used for daily breaks.';
