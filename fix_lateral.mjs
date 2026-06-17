import * as fs from 'fs';

const file = 'e:\\Inventory-planner-main (2) (1)\\supabase\\migrations\\078_new_allocation_logic.sql';
let content = fs.readFileSync(file, 'utf8');

const oldLateral = `        LATERAL (
            WITH channels(ch_name, ch_sv, ch_need) AS (
                VALUES 
                    ('Amazon', a1.amazon_sv, a1.fba_need_boxes),
                    ('Noon', a1.noon_sv, a1.fbn_need_boxes),
                    ('Minutes', a1.minutes_sv, a1.minutes_need_boxes)
            ),
            ranked_channels AS (
                SELECT ch_name, ch_sv, ch_need,
                       ROW_NUMBER() OVER (ORDER BY ch_sv DESC, ch_name ASC) AS rnk
                FROM channels
            ),
            alloc_calc AS (
                SELECT 
                    r1.ch_name AS r1_name, r1.ch_need AS r1_need,
                    r2.ch_name AS r2_name, r2.ch_need AS r2_need,
                    r3.ch_name AS r3_name, r3.ch_need AS r3_need,
                    
                    LEAST(r1.ch_need, a1.locad_boxes) AS r1_alloc,
                    LEAST(r2.ch_need, GREATEST(0, a1.locad_boxes - LEAST(r1.ch_need, a1.locad_boxes))) AS r2_alloc,
                    LEAST(r3.ch_need, GREATEST(0, a1.locad_boxes - LEAST(r1.ch_need, a1.locad_boxes) - LEAST(r2.ch_need, GREATEST(0, a1.locad_boxes - LEAST(r1.ch_need, a1.locad_boxes))))) AS r3_alloc
                FROM ranked_channels r1
                JOIN ranked_channels r2 ON r2.rnk = 2
                JOIN ranked_channels r3 ON r3.rnk = 3
                WHERE r1.rnk = 1
            )
            SELECT 
                CASE WHEN ac.r1_name = 'Amazon' THEN ac.r1_alloc 
                     WHEN ac.r2_name = 'Amazon' THEN ac.r2_alloc 
                     ELSE ac.r3_alloc END AS fba_boxes_alloc,
                CASE WHEN ac.r1_name = 'Noon' THEN ac.r1_alloc 
                     WHEN ac.r2_name = 'Noon' THEN ac.r2_alloc 
                     ELSE ac.r3_alloc END AS fbn_boxes_alloc,
                CASE WHEN ac.r1_name = 'Minutes' THEN ac.r1_alloc 
                     WHEN ac.r2_name = 'Minutes' THEN ac.r2_alloc 
                     ELSE ac.r3_alloc END AS minutes_boxes_alloc,
                
                ac.r1_name || ' > ' || ac.r2_name || ' > ' || ac.r3_name AS final_priority_rank,
                
                'Allocated ' || ac.r1_alloc || ' to ' || ac.r1_name || ' (Rank 1), ' ||
                ac.r2_alloc || ' to ' || ac.r2_name || ' (Rank 2), ' ||
                ac.r3_alloc || ' to ' || ac.r3_name || ' (Rank 3)' AS final_allocation_reason
                
            FROM alloc_calc ac
        ) alloc`;

const newLateral = `        LATERAL (
            SELECT 
                names[1] AS r1_name, needs[1] AS r1_need,
                names[2] AS r2_name, needs[2] AS r2_need,
                names[3] AS r3_name, needs[3] AS r3_need,
                
                LEAST(needs[1], a1.locad_boxes) AS r1_alloc,
                LEAST(needs[2], GREATEST(0, a1.locad_boxes - LEAST(needs[1], a1.locad_boxes))) AS r2_alloc,
                LEAST(needs[3], GREATEST(0, a1.locad_boxes - LEAST(needs[1], a1.locad_boxes) - LEAST(needs[2], GREATEST(0, a1.locad_boxes - LEAST(needs[1], a1.locad_boxes))))) AS r3_alloc
            FROM (
                SELECT 
                    ARRAY_AGG(ch_name ORDER BY ch_sv DESC, ch_name ASC) as names,
                    ARRAY_AGG(ch_need ORDER BY ch_sv DESC, ch_name ASC) as needs
                FROM (
                    VALUES 
                        ('Amazon', COALESCE(a1.amazon_sv, 0), COALESCE(a1.fba_need_boxes, 0)),
                        ('Noon', COALESCE(a1.noon_sv, 0), COALESCE(a1.fbn_need_boxes, 0)),
                        ('Minutes', COALESCE(a1.minutes_sv, 0), COALESCE(a1.minutes_need_boxes, 0))
                ) AS v(ch_name, ch_sv, ch_need)
            ) agg
        ) ac,
        LATERAL (
            SELECT 
                CASE WHEN ac.r1_name = 'Amazon' THEN ac.r1_alloc 
                     WHEN ac.r2_name = 'Amazon' THEN ac.r2_alloc 
                     ELSE ac.r3_alloc END AS fba_boxes_alloc,
                CASE WHEN ac.r1_name = 'Noon' THEN ac.r1_alloc 
                     WHEN ac.r2_name = 'Noon' THEN ac.r2_alloc 
                     ELSE ac.r3_alloc END AS fbn_boxes_alloc,
                CASE WHEN ac.r1_name = 'Minutes' THEN ac.r1_alloc 
                     WHEN ac.r2_name = 'Minutes' THEN ac.r2_alloc 
                     ELSE ac.r3_alloc END AS minutes_boxes_alloc,
                
                ac.r1_name || ' > ' || ac.r2_name || ' > ' || ac.r3_name AS final_priority_rank,
                
                'Allocated ' || ac.r1_alloc || ' to ' || ac.r1_name || ' (Rank 1), ' ||
                ac.r2_alloc || ' to ' || ac.r2_name || ' (Rank 2), ' ||
                ac.r3_alloc || ' to ' || ac.r3_name || ' (Rank 3)' AS final_allocation_reason
        ) alloc`;

content = content.replace(oldLateral, newLateral);
fs.writeFileSync(file, content);
console.log('Fixed performance of LATERAL join');
