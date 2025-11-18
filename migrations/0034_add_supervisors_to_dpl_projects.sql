
-- Add supervisor project managers to all existing DPL Outright and DPL Partnership projects
INSERT INTO project_members (project_id, user_id, invited_by, invitation_status, invited_at, joined_at)
SELECT 
    p.id as project_id,
    u.id as user_id,
    p.manager_id as invited_by,
    'accepted' as invitation_status,
    NOW() as invited_at,
    NOW() as joined_at
FROM projects p
CROSS JOIN users u
WHERE 
    (p.category = 'dpl_outright' OR p.category = 'dpl_partnership')
    AND u.role = 'project_manager'
    AND u.project_manager_type = 'supervisor'
    AND NOT EXISTS (
        SELECT 1 FROM project_members pm 
        WHERE pm.project_id = p.id 
        AND pm.user_id = u.id
    );
