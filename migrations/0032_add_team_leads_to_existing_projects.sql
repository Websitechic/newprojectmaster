
-- Add team leads to all existing projects
-- This migration ensures all current projects include team leads as members

INSERT INTO project_members (project_id, user_id, invited_by, invitation_status, joined_at)
SELECT 
    p.id as project_id,
    u.id as user_id,
    p.manager_id as invited_by,
    'accepted' as invitation_status,
    NOW() as joined_at
FROM projects p
CROSS JOIN users u
WHERE u.role = 'team_lead'
AND NOT EXISTS (
    SELECT 1 FROM project_members pm 
    WHERE pm.project_id = p.id 
    AND pm.user_id = u.id
);
