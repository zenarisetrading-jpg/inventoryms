-- 004_product_catalog.sql
-- Creates permanent product_catalog reference table (ASIN/FNSKU/SKU map, product category, COGS)
-- Corrects sku_master moq/units_per_box (003_update_upb_moq had wrong SKU names with trailing 'S')
-- Updates sku_master with fnsku, asin, cogs, product_category, sub_category from catalog data

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Rename trailing-S SKUs to canonical names
--    Migration 002 seeded sku_master with a trailing 'S' appended to most SKUs.
--    This block renames them across all dependent tables before the FK insert.
--    session_replication_role bypasses FK triggers for in-place PK renames.
-- ─────────────────────────────────────────────────────────────────────────────
SET session_replication_role = 'replica';

DO $$
DECLARE
  renames CONSTANT TEXT[][] := ARRAY[
    ARRAY['100PCSSHOECHARMSS', '100PCSSHOECHARMS'],
    ARRAY['14OZWBPEACHS', '14OZWBPEACH'],
    ARRAY['14OZWBPYELLOWS', '14OZWBPYELLOW'],
    ARRAY['175PCSPINKGOLDS', '175PCSPINKGOLD'],
    ARRAY['180ZWBBLACKS', '180ZWBBLACK'],
    ARRAY['18OZBABYWHALES', '18OZBABYWHALE'],
    ARRAY['18OZPINKDOLPHINS', '18OZPINKDOLPHIN'],
    ARRAY['18OZRAINBOWS', '18OZRAINBOW'],
    ARRAY['18OZSWBBLUES', '18OZSWBBLUE'],
    ARRAY['18OZSWBGREENS', '18OZSWBGREEN'],
    ARRAY['18OZSWBMIX1S', '18OZSWBMIX1'],
    ARRAY['18OZSWBPINKS', '18OZSWBPINK'],
    ARRAY['18OZWBBLUES', '18OZWBBLUE'],
    ARRAY['18OZWBBSPACES', '18OZWBBSPACE'],
    ARRAY['18OZWBBUBBLEGUMS', '18OZWBBUBBLEGUM'],
    ARRAY['18OZWBFLORALS', '18OZWBFLORAL'],
    ARRAY['18OZWBMUSHROOMS', '18OZWBMUSHROOM'],
    ARRAY['18OZWBPINKS', '18OZWBPINK'],
    ARRAY['18OZWBPRPLBUGS', '18OZWBPRPLBUG'],
    ARRAY['18OZWBSEAGREENS', '18OZWBSEAGREEN'],
    ARRAY['18OZWBSKYBLUES', '18OZWBSKYBLUE'],
    ARRAY['1LWBGREYWHITES', '1LWBGREYWHITE'],
    ARRAY['24ACRYLICCOMBOS', '24ACRYLICCOMBO'],
    ARRAY['30OZTALPHINES', '30OZTALPHINE'],
    ARRAY['30OZTBLACKS', '30OZTBLACK'],
    ARRAY['30OZTBLUES', '30OZTBLUE'],
    ARRAY['30OZTGREENS', '30OZTGREEN'],
    ARRAY['30OZTMOCHAS', '30OZTMOCHA'],
    ARRAY['30OZTPINKS', '30OZTPINK'],
    ARRAY['320ZWBGREYS', '320ZWBGREY'],
    ARRAY['320ZWBORANGES', '320ZWBORANGE'],
    ARRAY['320ZWBROSEPINKS', '320ZWBROSEPINK'],
    ARRAY['32OZBLACK2IN1S', '32OZBLACK2IN1'],
    ARRAY['32OZDARKNIGHTS', '32OZDARKNIGHT'],
    ARRAY['32OZDRAIN2IN1S', '32OZDRAIN2IN1'],
    ARRAY['32OZDRAINBOWS', '32OZDRAINBOW'],
    ARRAY['32OZNAVY2IN1S', '32OZNAVY2IN1'],
    ARRAY['32OZPINK2IN1S', '32OZPINK2IN1'],
    ARRAY['32OZSTRAWLIDBLACKS', '32OZSTRAWLIDBLACK'],
    ARRAY['32OZSTRAWLIDGREENS', '32OZSTRAWLIDGREEN'],
    ARRAY['32OZSTRAWLIDNAVYBLUES', '32OZSTRAWLIDNAVYBLUE'],
    ARRAY['32OZSTRAWLIDPINKS', '32OZSTRAWLIDPINK'],
    ARRAY['32OZSTRAWLIDSKYBLUES', '32OZSTRAWLIDSKYBLUE'],
    ARRAY['32OZWBBLACKNEWS', '32OZWBBLACKNEW'],
    ARRAY['32OZWBGREENNEWS', '32OZWBGREENNEW'],
    ARRAY['32OZWBNAVYBLUES', '32OZWBNAVYBLUE'],
    ARRAY['32OZWBPURPLES', '32OZWBPURPLE'],
    ARRAY['32OZWBREDS', '32OZWBRED'],
    ARRAY['32OZWBSKYBLUES', '32OZWBSKYLUE'],
    ARRAY['32OZWBWHITES', '32OZWBWHITE'],
    ARRAY['32OZWBYELLOWS', '32OZWBYELLOW'],
    ARRAY['36ACRYLICCOLORSS', '36ACRYLICCOLORS'],
    ARRAY['400ZBLACKS', '400ZBLACK'],
    ARRAY['400ZBLUES', '400ZBLUE'],
    ARRAY['400ZGRAPHITES', '400ZGRAPHITE'],
    ARRAY['40OZBUBBLEGUMS', '40OZBUBBLEGUM'],
    ARRAY['40OZDARKNIGHTS', '40OZDARKNIGHT'],
    ARRAY['40OZDARKRAINBOWS', '40OZDARKRAINBOW'],
    ARRAY['40OZGREENS', '40OZGREEN'],
    ARRAY['40OZSEAGREENS', '40OZSEAGREEN'],
    ARRAY['40OZSKYS', '40OZSKY'],
    ARRAY['40OZTALPPINES', '40OZTALPINE'],
    ARRAY['40OZTBLACKS', '40OZTBLACK'],
    ARRAY['40OZTBLUES', '40OZTBLUE'],
    ARRAY['40OZTGREENS', '40OZTGREEN'],
    ARRAY['40OZTMOCHAS', '40OZTMOCHA'],
    ARRAY['40OZTPINKS', '40OZTPINK'],
    ARRAY['500MLBLACKS', '500MLBLACK'],
    ARRAY['500MLGREENS', '500MLGREEN'],
    ARRAY['500MLPEACHS', '500MLPEACH'],
    ARRAY['500MLTEAPINKS', '500MLTEAPINK'],
    ARRAY['50PCSSHOECHARMSS', '50PCSSHOECHARMS'],
    ARRAY['5MODESHOWERS', '5MODESHOWER'],
    ARRAY['5MODESHOWERWHOSES', '5MODESHOWERWHOSE'],
    ARRAY['5PCBLUENEWS', '5PCBLUENEW'],
    ARRAY['5PCGREYNEWS', '5PCGREYNEW'],
    ARRAY['5PCPINKNEWS', '5PCPINKNEW'],
    ARRAY['5PCSKYBLUES', '5PCSKYBLUE'],
    ARRAY['5PCSLIGHTPINKS', '5PCSLIGHTPINK'],
    ARRAY['6PCBLUENEWS', '6PCBLUENEW'],
    ARRAY['6PCGREYNEWS', '6PCGREYNEW'],
    ARRAY['6PCPINKNEWS', '6PCPINKNEW'],
    ARRAY['6PCSLIGHTBLUES', '6PCSLIGHTBLUE'],
    ARRAY['6PCSLIGHTPINKS', '6PCSLIGHTPINK'],
    ARRAY['BLACKSILICONEBOWLS', 'BLACKSILICONEBOWL'],
    ARRAY['BLKSLCNBOWLLARGES', 'BLKSLCNBOWLLARGE'],
    ARRAY['BLUEORANGE1LS', 'BLUEORANGE1L'],
    ARRAY['BLUEPINK1LS', 'BLUEPINK1L'],
    ARRAY['CATBEDWBLNKTS', 'CATBEDWBLNKT'],
    ARRAY['CATWINDWBEDS', 'CATWINDWBED'],
    ARRAY['COFFEEMAT3040BLACKS', 'COFFEEMAT3040BLACK'],
    ARRAY['COFFEEMAT6040BLACKS', 'COFFEEMAT6040BLACK'],
    ARRAY['CRNRSHWERCADDYBLACKS', 'CRNRSHWERCADDYBLACK'],
    ARRAY['DENTALFLOSSERS', 'DENTALFLOSSER'],
    ARRAY['GREYSLCNBWLSMALLS', 'GREYSLCNBWLSMALL'],
    ARRAY['IDSWBPINKS', 'KIDSWBPINK'],
    ARRAY['KIDSPINKFLAMINGOS', 'KIDSPINKFLAMINGO'],
    ARRAY['KIDSWBBLUES', 'KIDSWBBLUE'],
    ARRAY['KIDSWBGRNDINOS', 'KIDSWBGRNDINO'],
    ARRAY['LITTERMATLARGES', 'LITTERMATLARGE'],
    ARRAY['LITTERMATMEDIUMS', 'LITTERMATMEDIUM'],
    ARRAY['RCCARYELLOWS', 'RCCARYELLOW'],
    ARRAY['RCONTROLCARBLUES', 'RCONTROLCARBLUE'],
    ARRAY['RCONTROLCARREDS', 'RCONTROLCARRED'],
    ARRAY['SINKORGNZR2PCKS', 'SINKORGNZR2PCK'],
    ARRAY['STUNTCARGREENS', 'STUNTCARGREEN'],
    ARRAY['STUNTCARYELLOWS', 'STUNTCARYELLOW'],
    ARRAY['WALLSHWRCADDYS', 'WALLSHWRCADDY'],
    ARRAY['WB15LPURPLES', 'WB15LPURPLE'],
    ARRAY['WB500mlGREENS', 'WB500mlGREEN'],
    ARRAY['WB750MLBLACKS', 'WB750MLBLACK'],
    ARRAY['WB750MLBLUES', 'WB750MLBLUE'],
    ARRAY['WB750MLGREYS', 'WB750MLGREY'],
    ARRAY['WB750MLPINKS', 'WB750MLPINK'],
    ARRAY['WB750MLREDS', 'WB750MLRED'],
    ARRAY['WB750MLSGREENS', 'WB750MLSGREEN'],
    ARRAY['WB750MLYELLOWS', 'WB750MLYELLOW'],
    ARRAY['WB750mlPEACHS', 'WB750mlPEACH'],
    ARRAY['WB750mlPURPLES', 'WB750mlPURPLE'],
    ARRAY['WB750mlSILVERS', 'WB750mlSILVER']
  ];
  pair TEXT[];
  old_sku TEXT;
  new_sku TEXT;
BEGIN
  FOREACH pair SLICE 1 IN ARRAY renames LOOP
    old_sku := pair[1];
    new_sku := pair[2];
    IF EXISTS (SELECT 1 FROM sku_master WHERE sku = old_sku)
       AND NOT EXISTS (SELECT 1 FROM sku_master WHERE sku = new_sku) THEN
      UPDATE sales_snapshot     SET sku = new_sku WHERE sku = old_sku;
      UPDATE inventory_snapshot SET sku = new_sku WHERE sku = old_sku;
      UPDATE demand_metrics     SET sku = new_sku WHERE sku = old_sku;
      UPDATE allocation_plans   SET sku = new_sku WHERE sku = old_sku;
      UPDATE po_line_items      SET sku = new_sku WHERE sku = old_sku;
      UPDATE locad_sku_map      SET internal_sku = new_sku WHERE internal_sku = old_sku;
      UPDATE sku_master         SET sku = new_sku WHERE sku = old_sku;
    END IF;
  END LOOP;
END $$;

SET session_replication_role = 'origin';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add product_category column to sku_master
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE sku_master ADD COLUMN IF NOT EXISTS product_category TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Create product_catalog table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_catalog (
  sku                  TEXT PRIMARY KEY REFERENCES sku_master(sku),
  asin                 TEXT,
  fnsku                TEXT,
  title                TEXT,
  product_category     TEXT,
  product_sub_category TEXT,
  cogs                 NUMERIC
);

ALTER TABLE product_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all"         ON product_catalog FOR ALL TO authenticated USING (true);
CREATE POLICY "service_role_all" ON product_catalog FOR ALL TO service_role  USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Ensure any SKUs not yet in sku_master are inserted (new/unlisted SKUs)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO sku_master (sku, name) VALUES
  ('40OZGREEN',       'S2C Water Bottle 40oz Green'),
  ('18OZPINKDOLPHIN', 'S2C Kids Water Bottle 18oz Pink Dolphin')
ON CONFLICT (sku) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Insert product_catalog data
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO product_catalog (sku, asin, fnsku, title, product_category, product_sub_category, cogs) VALUES
  ('WHALEBLUE-2COMP-LB',    'B0FDWJC58Y', 'X002C6AYY5', 'S2C Stainless Steel Kids Lunch Box | 2-Compartment Bento Box with Leak-Proof Lid & Cute Printed Design | Compact & Easy-to-Carry | Ideal for School Snacks & Meals (BLUE WHALE)',   'Lunch Box',       '2 COMP',                 19.28),
  ('BUGPURPLE-2COMP-LB',    'B0FDVF7RKT', 'X002C6CH1X', 'S2C Stainless Steel Kids Lunch Box | 2-Compartment Bento Box with Leak-Proof Lid & Cute Printed Design | Compact & Easy-to-Carry | Ideal for School Snacks & Meals (PURPLE BUG)',   'Lunch Box',       '2 COMP',                 19.28),
  ('RAINBOW-2COMP-LB',      'B0FDVZ656R', 'X002C67709', 'S2C Stainless Steel Kids Lunch Box | 2-Compartment Bento Box with Leak-Proof Lid & Cute Printed Design | Compact & Easy-to-Carry | Ideal for School Snacks & Meals (RAINBOW)',       'Lunch Box',       '2 COMP',                 19.28),
  ('24ACRYLICCOMBO',        'B0DL5P6243', 'X001UOXBCH', 'S2C Acrylic Paint & Professional Brush Combo Set - 24x12ml Non-Toxic Vibrant Acrylic Colors + Nylon Hair Brushes for Canvas, Wood, Rock & Face Painting',                           'Art Supplies',    '24 Color Combo',         11.54),
  ('SE-YYC0-6GAQ',          'B08V9BC4QN', 'X0025VRWXD', 'S2C Acrylic Paint set, 24x12ml Tubes Artist Quality oil Acrylic paints water color Non Toxic vibrant colors (Color-24)',                                                            'Art Supplies',    '24 colors',               7.18),
  ('WHALEBLUE-3COMP-LB',    'B0FDQZTJ1V', 'X002C5ZWFH', 'S2C 1400ml LeakProof Lunch Box for Kids School with Spoon Fork & Knife – 3 Compartments Tiffin Box (BLUE WHALE)',                                                                   'Lunch Box',       '3 COMP',                 19.28),
  ('RAINBOW-3COMP-LB',      'B0FDR3C11D', 'X002C5RABL', 'S2C 1400ml LeakProof Lunch Box for Kids School with Spoon Fork & Knife – 3 Compartments Tiffin Box (RAINBOW)',                                                                      'Lunch Box',       '3 COMP',                 19.28),
  ('BUGPURPLE-3COMP-LB',    'B0FDR3H1N5', 'X002C5RDHR', 'S2C 1400ml LeakProof Lunch Box for Kids School with Spoon Fork & Knife – 3 Compartments Tiffin Box (PURPLE BUG)',                                                                   'Lunch Box',       '3 COMP',                 19.28),
  ('30OZTBLACK',            'B0DSFZ22TB', 'X001UC3K2Z', 'S2C Zenith TrekMate 30oz Stainless Steel Tumbler with Handle & Flip Straw | Leakproof, Double-Wall Insulated (Black)',                                                               'Tumblrs',         '30oz',                   10.77),
  ('30OZTBLUE',             'B0DSFYG1FJ', 'X0027OXZMF', 'S2C Zenith TrekMate 30oz Stainless Steel Tumbler with Handle & Flip Straw | Leakproof, Double-Wall Insulated (Blue)',                                                                'Tumblrs',         '30oz',                   10.77),
  ('30OZTGREEN',            'B0DSFYFTYD', 'X0027OV2BV', 'S2C Zenith TrekMate 30oz Stainless Steel Tumbler with Handle & Flip Straw | Leakproof, Double-Wall Insulated (Green)',                                                               'Tumblrs',         '30oz',                   10.77),
  ('30OZTMOCHA',            'B0DSFY76L6', 'X0027OQGGR', 'S2C Zenith TrekMate 30oz Stainless Steel Tumbler with Handle & Flip Straw | Leakproof, Double-Wall Insulated (Mocha)',                                                               'Tumblrs',         '30oz',                   10.77),
  ('30OZTPINK',             'B0DSFZK5W7', 'X0027OY19L', 'S2C Zenith TrekMate 30oz Stainless Steel Tumbler with Handle & Flip Straw | Leakproof, Double-Wall Insulated (Pink)',                                                                'Tumblrs',         '30oz',                   10.77),
  ('30OZTALPHINE',          'B0DSFZBCQ6', 'X0027OXXMH', 'S2C Zenith TrekMate 30oz Stainless Steel Tumbler with Handle & Flip Straw | Keeps Drinks Hot & Cold for Hours (Alpine)',                                                             'Tumblrs',         '30oz',                   10.77),
  ('32OZWBNAVYBLUE',        'B0CD2VQXZ9', 'X001ZCOJYX', 'S2C Stainless Steel Water Bottle 1L, 32oz Double Wall Vacuum Insulated, BPA Free with Spout Lid (NAVY BLUE)',                                                                        'Water Bottles',   '32oz Spout',             11.79),
  ('32OZDARKNIGHT',         'B0F99R2PR9', 'X001S44VD7', 'S2C Stainless Steel Water Bottle 1L, 32oz Double Wall Vacuum Insulated Water Bottle, BPA Free with Spout Lid (DARK NIGHT)',                                                          'Water Bottles',   '32oz Spout',             11.79),
  ('32OZWBPURPLE',          'B0F6CBFM59', 'X002B7Z9EZ', 'S2C Stainless Steel Water Bottle 1L, 32oz Double Wall Vacuum Insulated Water Bottle, BPA Free with Spout Lid (PURPLE)',                                                              'Water Bottles',   '32oz Spout',             11.79),
  ('32OZWBRED',             'B0CKT6VV9G', 'X002AHYSWP', 'S2C Stainless Steel Water Bottle 1L, 32oz Double Wall Vacuum Insulated Water Bottle, BPA Free with Spout Lid (RED)',                                                                 'Water Bottles',   '32OZ-2 IN 1',            11.79),
  ('32OZWBBLACKNEW',        'B0CD2WJT3N', 'X001VVN0FH', 'S2C Stainless Steel Water Bottle 1L, 32oz Double Wall Vacuum Insulated Water Bottle, BPA Free with Spout Lid (BLACK)',                                                               'Water Bottles',   '32oz Spout',             11.79),
  ('320ZWBROSEPINK',        'B0CKSVJT47', 'X001TWA0TR', 'S2C Stainless Steel Water Bottle 1L, 32oz Double Wall Vacuum Insulated Water Bottle, BPA Free with Spout Lid (G PINK)',                                                              'Water Bottles',   '32oz Spout',             11.79),
  ('320ZWBGREY',            'B0CKSRCXNN', 'X001VV4UXX', 'S2C Stainless Steel Water Bottle 1L, 32oz Double Wall Vacuum Insulated Water Bottle, BPA Free with Spout Lid (GREY)',                                                                'Water Bottles',   '32oz Spout',             11.79),
  ('320ZWBORANGE',          'B0CKSRWR85', 'X001VVFXHP', 'S2C Stainless Steel Water Bottle 1L, 32oz Double Wall Vacuum Insulated Water Bottle, BPA Free with Spout Lid (ORANGE)',                                                              'Water Bottles',   '32oz Spout',             11.79),
  ('BH-JUJ1-WPO5',         'B0CD3JGXP3', 'X001VVBF63', 'S2C Stainless Steel Water Bottle 1L, 32oz Double Wall Vacuum Insulated Water Bottle, BPA Free with Spout Lid (ROSE PINK)',                                                           'Water Bottles',   '32oz Spout',             11.79),
  ('32OZWBGREENNEW',        'B0CD2T2PMD', 'X001TW97PF', 'S2C Stainless Steel Water Bottle 1L, 32oz Double Wall Vacuum Insulated Water Bottle, BPA Free with Spout Lid (SEA GREEN)',                                                           'Water Bottles',   '32oz Spout',             11.79),
  ('32OZWBSKYLUE',          'B0CD3K1ST4', 'X001TW8WJ7', 'S2C Stainless Steel Water Bottle 1L, 32oz Double Wall Vacuum Insulated Water Bottle, BPA Free with Spout Lid (SKY BLUE)',                                                            'Water Bottles',   '32oz Spout',             11.79),
  ('32OZWBWHITE',           'B0CKSRFGBH', 'X001TWE1M9', 'S2C Stainless Steel Water Bottle 1L, 32oz Double Wall Vacuum Insulated Water Bottle, BPA Free with Spout Lid (WHITE)',                                                               'Water Bottles',   '32oz Spout',             11.79),
  ('32OZWBYELLOW',          'B0CKSSZK2W', 'X001VVFMFN', 'S2C Stainless Steel Water Bottle 1L, 32oz Double Wall Vacuum Insulated Water Bottle, BPA Free with Spout Lid (YELLOW)',                                                              'Water Bottles',   '32oz Spout',             11.79),
  ('32OZSTRAWLIDBLACK',     'B0CL9KT95G', 'X001VVB64J', 'S2C Stainless Steel Water Bottle 1L, 32oz Double Wall Vacuum Insulated, BPA Free Water Bottle with Straw lid (BLACK)',                                                               'Water Bottles',   '32oz Straw',             11.79),
  ('32OZSTRAWLIDGREEN',     'B0CL9MSF5Q', 'X001W2FJ95', 'S2C Stainless Steel Water Bottle 1L, 32oz Double Wall Vacuum Insulated, BPA Free Water Bottle with Straw lid (GREEN)',                                                               'Water Bottles',   '32oz Straw',             11.79),
  ('32OZSTRAWLIDNAVYBLUE',  'B0CL9N181R', 'X001W2FUGR', 'S2C Stainless Steel Water Bottle 1L, 32oz Double Wall Vacuum Insulated, BPA Free Water Bottle with Straw lid (NAVY BLUE)',                                                           'Water Bottles',   '32oz Straw',             11.79),
  ('32OZSTRAWLIDPINK',      'B0CL9LJJXD', 'X001W2GFJN', 'S2C Stainless Steel Water Bottle 1L, 32oz Double Wall Vacuum Insulated, BPA Free Water Bottle with Straw lid (ROSE PINK)',                                                           'Water Bottles',   '32oz Straw',             11.79),
  ('32OZSTRAWLIDSKYBLUE',   'B0CL9MNSCY', 'X001W2B2GJ', 'S2C Stainless Steel Water Bottle 1L, 32oz Double Wall Vacuum Insulated, BPA Free Water Bottle with Straw lid (SKY BLUE)',                                                            'Water Bottles',   '32oz Straw',             11.79),
  ('32OZPINK2IN1',          'B0FFB8WPJ3', 'X002C9PAGJ', 'S2C Stainless Steel 1L, 32oz Double Wall Vacuum Insulated Water Bottle, BPA Free with Spout Lid (PINK)',                                                                             'Water Bottles',   '32OZ-2 IN 1',            11.79),
  ('32OZDRAIN2IN1',         'B0FFB9DLRT', 'X002C9POYR', 'S2C Stainless Steel 1L, 32oz Double Wall Vacuum Insulated Water Bottle, BPA Free with Spout Lid (DARK RAINBOW)',                                                                     'Water Bottles',   '32OZ-2 IN 1',            11.79),
  ('32OZBLACK2IN1',         'B0FFB6SC6W', 'X002C9O6BJ', 'S2C Stainless Steel 1L, 32oz Double Wall Vacuum Insulated Water Bottle, BPA Free with Spout Lid (BLACK)',                                                                            'Water Bottles',   '32OZ-2 IN 1',            11.79),
  ('32OZNAVY2IN1',          'B0FFB7V323', 'X002C9O501', 'S2C Stainless Steel 1L, 32oz Double Wall Vacuum Insulated Water Bottle, BPA Free with Spout Lid (NAVY BLUE)',                                                                        'Water Bottles',   '32OZ-2 IN 1',            11.79),
  ('36ACRYLICCOLORS',       'B0C8HWKTFX', 'X001B61TN7', 'S2C Acrylic Paint set, 36x12ml Tubes Artist Quality Non Toxic vibrant colors (36 COLORS)',                                                                                           'Art Supplies',    '36 Colors',              11.11),
  ('40OZSEAGREEN',          'B0C7S25F16', 'X001SK9VHR', 'S2C 1200ML Insulated Water Bottle with 3 Lids, Double Wall, Leak Proof, Stainless Steel Bottle With Straw For Gym (SEA GREEN)',                                                      'Water Bottles',   '40oz',                   16.15),
  ('40OZBUBBLEGUM',         'B0C6FRRGCV', 'X001SRBAAV', 'S2C 1200ML Insulated Water Bottle with 3 Lids, Double Wall, Leak Proof, Stainless Steel Bottle With Straw For Gym (BUBBLE GUM)',                                                     'Water Bottles',   '40oz',                   16.15),
  ('40OZDARKNIGHT',         'B0B6SQB5Q4', 'X001SDUDZD', 'S2C 1200ML Insulated Water Bottle with 3 Lids, Double Wall, Leak Proof, Stainless Steel Bottle With Straw For Gym (DARK NIGHT)',                                                     'Water Bottles',   '40oz',                   16.15),
  ('40OZSKY',               'B0C6FS4Z25', 'X001LP4EFX', 'S2C 1200ML Insulated Water Bottle with 3 Lids, Double Wall, Leak Proof, Stainless Steel Bottle With Straw For Gym (SKY)',                                                            'Water Bottles',   '40oz',                   16.15),
  ('400ZBLACK',             'B0B6SRV4M3', 'X001SDTLHJ', 'S2C 1200ML Insulated Water Bottle with 3 Lids, Double Wall, Leak Proof, Stainless Steel Water Bottle With Straw For Gym (BLACK)',                                                    'Water Bottles',   '40oz',                   16.15),
  ('400ZBLUE',              'B0B6SRTFM3', 'X001LP4Y6R', 'S2C 1200ML Insulated Water Bottle with 3 Lids, Double Wall, Leak Proof, Stainless Steel Water Bottle With Straw For Gym (BLUE)',                                                     'Water Bottles',   '40oz',                   16.15),
  ('40OZDARKRAINBOW',       'B0BDVSHLFF', 'X001LP505V', 'S2C 1200ML Insulated Water Bottle with 3 Lids, Double Wall, Leak Proof, Stainless Steel Straw Water Bottle For Gym (DARK RAINBOW)',                                                  'Water Bottles',   '40oz',                   16.15),
  ('400ZGRAPHITE',          'B0B6SP3859', 'X001MT0ZKL', 'S2C 1200ML Insulated Water Bottle with 3 Lids, Double Wall, Leak Proof, Stainless Steel Straw Water Bottle For Gym (GREY)',                                                          'Water Bottles',   '40oz',                   16.15),
  ('40OZTALPINE',           'B0DSG4MD58', 'X001L9V8FD', 'S2C 40oz Stainless Steel Tumbler with Handle & Straw – Double Wall Vacuum Insulated Mug – Leakproof, BPA-Free (Alpine)',                                                             'Tumblrs',         '40ozT',                  11.28),
  ('40OZTBLACK',            'B0DSF6V13B', 'X0027P1I19', 'S2C 40oz Stainless Steel Tumbler with Handle & Straw – Double Wall Vacuum Insulated Mug – Leakproof, BPA-Free (Black)',                                                              'Tumblrs',         '40ozT',                  11.28),
  ('40OZTBLUE',             'B0DSG3Z8J7', 'X0027OH9TZ', 'S2C 40oz Stainless Steel Tumbler with Handle & Straw – Double Wall Vacuum Insulated Mug – Leakproof, BPA-Free (Blue)',                                                               'Tumblrs',         '40ozT',                  11.28),
  ('40OZTGREEN',            'B0DSF61J51', 'X0027P3VL9', 'S2C 40oz Stainless Steel Tumbler with Handle & Straw – Double Wall Vacuum Insulated Mug – Leakproof, BPA-Free (Green)',                                                              'Tumblrs',         '40ozT',                  11.28),
  ('40OZTMOCHA',            'B0DSF8B5NH', 'X0027OWVWF', 'S2C 40oz Stainless Steel Tumbler with Handle & Straw – Double Wall Vacuum Insulated Mug – Leakproof, BPA-Free (Mocha)',                                                              'Tumblrs',         '40ozT',                  11.28),
  ('40OZTPINK',             'B0DSF5XD3H', 'X0027P5E5P', 'S2C 40oz Stainless Steel Tumbler with Handle & Straw – Double Wall Vacuum Insulated Mug – Leakproof, BPA-Free (Pink)',                                                               'Tumblrs',         '40ozT',                  11.28),
  ('500MLBLACK',            'B0C77KPS8D', 'X001UTKAGR', 'S2C Water Bottle Stainless Steel 500ml - Double Wall insulated Water Bottle for Kids School Flask (BLACK)',                                                                           'Water Bottles',   '500 ML',                  8.20),
  ('500MLPEACH',            'B0C77KZXZD', 'X001SLOIWJ', 'S2C Water Bottle Stainless Steel 500ml - Double Wall insulated Water Bottle for Kids School Flask (DARKBLUE)',                                                                        'Water Bottles',   '500 ML',                  8.20),
  ('WB500mlGREEN',          'B0DG55LWJC', 'X001SLJZM7', 'S2C Water Bottle Stainless Steel 500ml - Double Wall insulated Water Bottle for Kids School Flask (GREEN)',                                                                           'Water Bottles',   '500 ML',                  8.20),
  ('500MLGREEN',            'B0C77LYQN3', 'X0024E2XY9', 'S2C Water Bottle Stainless Steel 500ml - Double Wall insulated Water Bottle for Kids School Flask (SEA GREEN)',                                                                       'Water Bottles',   '500 ML',                  8.20),
  ('500MLTEAPINK',          'B0C77HR86X', 'X001SLK0QR', 'S2C Water Bottle Stainless Steel 500ml - Double Wall insulated Water Bottle for Kids School Flask (TEA PINK)',                                                                        'Water Bottles',   '500 ML',                  8.20),
  ('WB750MLBLACK',          'B0BM6NZ9XT', 'X001SLORBB', 'S2C Water Bottle Stainless Steel 750ml - Double Wall insulated Water Bottle for Kids School Flask (BLACK)',                                                                           'Water Bottles',   '750ML',                   9.64),
  ('WB750MLBLUE',           'B0BM6M92RQ', 'X001O402EN', 'S2C Water Bottle Stainless Steel 750ml - Double Wall insulated Water Bottle for Kids School Flask (BLUE)',                                                                            'Water Bottles',   '750ML',                   9.64),
  ('WB750MLSGREEN',         'B0BM6LKX1Z', 'X001O3RC79', 'S2C Water Bottle Stainless Steel 750ml - Double Wall insulated Water Bottle for Kids School Flask (GREEN)',                                                                           'Water Bottles',   '750ML',                   9.64),
  ('WB750MLGREY',           'B0BM6N374C', 'X001O3V3UV', 'S2C Water Bottle Stainless Steel 750ml - Double Wall insulated Water Bottle for Kids School Flask (GREY)',                                                                            'Water Bottles',   '750ML',                   9.64),
  ('WB750mlPEACH',          'B0CFVZNVYZ', 'X001O3RCE7', 'S2C Water Bottle Stainless Steel 750ml - Double Wall insulated Water Bottle for Kids School Flask (PEACH)',                                                                           'Water Bottles',   '750ML',                   9.64),
  ('WB750mlPURPLE',         'B0CFVWG53B', 'X001UBPE7P', 'S2C Water Bottle Stainless Steel 750ml - Double Wall insulated Water Bottle for Kids School Flask (PURPLE)',                                                                          'Water Bottles',   '750ML',                   9.64),
  ('WB750MLRED',            'B0BM6MYHN5', 'X001UBW51D', 'S2C Water Bottle Stainless Steel 750ml - Double Wall insulated Water Bottle for Kids School Flask (RED)',                                                                             'Water Bottles',   '750ML',                   9.64),
  ('WB750mlSILVER',         'B0CFVTL8S5', 'X001O3R90T', 'S2C Water Bottle Stainless Steel 750ml - Double Wall insulated Water Bottle for Kids School Flask (SILVER)',                                                                         'Water Bottles',   '750ML',                   9.64),
  ('WB750MLPINK',           'B0BM6M3DPW', 'X001UBWYFZ', 'S2C Water Bottle Stainless Steel 750ml - Double Wall insulated Water Bottle for Kids School Flask (TEA PINK)',                                                                        'Water Bottles',   '750ML',                   9.64),
  ('9J-YOUU-HW3U',          'B0CFVX1H24', 'X001O3V6IZ', 'S2C Water Bottle Stainless Steel 750ml - Double Wall insulated Water Bottle for Kids School Flask (WHITE)',                                                                           'Water Bottles',   '750ML',                   9.64),
  ('WB750MLYELLOW',         'B0FFM7RJ4L', 'X002CBLFD9', 'S2C Water Bottle Stainless Steel 750ml - Double Wall insulated Water Bottle for Kids School Flask (YELLOW)',                                                                          'Water Bottles',   '750ML',                   9.64),
  ('5PCPINKNEW',            'B0C71HB4WH', 'X001TW8X1J', 'S2C 11 Pcs Silicone Baby Feeding Set, Led Weaning Set, Suction Silicone Baby Plate with Divider, Feeder, Bib, Spoon (PINK)',                                                         'Baby and Toddlers','Baby Feeding Set',       19.00),
  ('5PCSKYBLUE',            'B0D9BVP7SZ', 'X001SK8WGD', 'S2C 11 Pcs Silicone Baby Feeding Set, Led Weaning Set, Suction Silicone Baby Plate with Divider, Feeder, Bib, Spoon (SKY BLUE)',                                                     'Baby and Toddlers','Baby Feeding Set',       19.00),
  ('5PCGREYNEW',            'B0C71FR6SB', 'X0022XNN69', 'S2C 11 Pcs Silicone Baby Feeding Set, Led Weaning Set, Suction Silicone Plate with Divider, Feeder, Bib, Spoon (GREY)',                                                              'Baby and Toddlers','Baby Feeding Set',       19.00),
  ('5PCSLIGHTPINK',         'B0DJY8SPG1', 'X001SRMTCT', 'S2C 5 Pcs Silicone Baby Feeding Set, Baby Led Weaning Set, Suction Silicone Baby Plate with Divider, Baby Feeder, Bib, Spoon (Light Pink)',                                          'Baby and Toddlers','Baby Feeding Set',       15.91),
  ('5PCBLUENEW',            'B0C71HHRRQ', 'X0025I4P13', 'S2C 5 Pcs Silicone Baby Feeding Set, Led Weaning Supplies for Toddlers and Newborns - Suction Plate with Divider, Feeder, Bib, Spoon (Blue)',                                        'Baby and Toddlers','Baby Feeding Set',       15.91),
  ('6PCBLUENEW',            'B0C71FH3N1', 'X001ZNA01X', 'S2C 6 Pcs Silicone Baby Feeding Set, Baby Led Weaning Set, Suction Silicone Baby Plate with Divider, Baby Feeder, Bib, Spoon (BLUE)',                                                'Baby and Toddlers','Baby Feeding Set',       15.91),
  ('6PCPINKNEW',            'B0C71FVNZW', 'X001SK9VDB', 'S2C 6 Pcs Silicone Baby Feeding Set, Baby Led Weaning Set, Suction Silicone Plate with Divider, Feeder, Bib, Spoon (PINK)',                                                          'Baby and Toddlers','Baby Feeding Set',       15.91),
  ('6PCSLIGHTBLUE',         'B0CGML9XF1', 'X001SK8W8L', 'S2C 6 Pcs Silicone Baby Feeding Set, Baby Led Weaning Set, Suction Silicone Plate with Divider, Feeder, Bib, Spoon (SKY BLUE)',                                                      'Baby and Toddlers','Baby Feeding Set',       15.91),
  ('6PCGREYNEW',            'B0C71HYMWC', 'X001UP5NNB', 'S2C 6 Pcs Silicone Baby Feeding Set, Baby Led Weaning Set, Suction Silicone Plate with Divider, Feeder, Bib, Spoon (YELLOW)',                                                        'Baby and Toddlers','Baby Feeding Set',       15.91),
  ('6PCSLIGHTPINK',         'B0CGMMSMCH', 'X001SKBIFP', 'S2C 6 Pcs Silicone Baby Feeding Set, Led Weaning Supplies for Toddlers, Suction Plate with Divider, Feeder, Bib, Spoon (Light Pink)',                                                'Baby and Toddlers','Baby Feeding Set',       15.91),
  ('V8-0T2I-663N',          'B0F1XVVC22', 'X001W2JFIV', 'S2C Stretched White Blank Canvas – Artist Canvas Board – Wooden Painting Panel Boards for Acrylic, Oil & Watercolor – DIY Drawing & Painting (Pack of 6)',                           'Art Supplies',    'Canvas Board',           11.04),
  ('LITTERMATMEDIUM',       'B0CJDZ8BG2', 'X0021KMDFZ', 'S2C Premium Cat Litter Mat, Scatter Control, Waterproof Double Layer Honeycomb Design, Easy To Clean (45 * 60)',                                                                     'Pet Supplies',    'Cat Litter Mat',          6.89),
  ('LITTERMATLARGE',        'B0CJDWPYNR', 'X001VEQS49', 'S2C Premium Cat Litter Mat, Scatter Control, Waterproof Double Layer Honeycomb Design, Easy To Clean (55 * 75)',                                                                     'Pet Supplies',    'Cat Litter Mat',          9.36),
  ('CATSCRATCHPAD60x40',    'B0CYQBHR9G', 'X001VJBKM9', 'S2C Cat Scratching Mat, 60x40CM Natural Sisal Cat Scratch Mats, Horizontal Non Slip Cat Scratch Pad & Cat Rug for Floor',                                                            'Pet Supplies',    'Cat Mat',                 8.08),
  ('CATBEDWBLNKT',          'B0BZW76QLC', 'X001ZODSXT', 'S2C Cat Window Bed with Blanket, Perch Window Seat Suction Cups Space-Saving Cat Hammock for Cats up to 22 kgs (WITH CUSHION)',                                                       'Pet Supplies',    'Cat Window Bed',         16.92),
  ('CATWINDWBED',           'B0BZW5PXXZ', 'X001R11KRV', 'S2C Cat Window Bed, Perch Window Seat Suction Cups Space-Saving Cat Hammock for Cats up to 22 kgs (WITHOUT CUSHION)',                                                                'Pet Supplies',    'Cat Window Bed',         11.79),
  ('JU-XL02-EHTG',          'B0DRJ977XW', 'X001U92IFX', 'S2C Cordless Water Flosser – Rechargeable Oral Irrigator for Teeth Cleaning – IPX7 Waterproof, 3 Pressure Modes',                                                                   'Health',          'Dental Flosser',         27.47),
  ('DENTALFLOSSER',         'B0DRL2YZ2P', 'X0027CCKXH', 'S2C Cordless Water Flosser – Rechargeable Oral Irrigator for Teeth Cleaning – IPX7 Waterproof, 3 Pressure Modes',                                                                   'Health',          'Dental Flosser',         27.47),
  ('IW-OT00-2JCP',          'B09TR8TMHR', 'X0027COUG7', 'S2C Dish Drying Stand & Drainer - Large Countertop Antibacterial Dish Rack (Black)',                                                                                                 'Home and Kitchen','Dish Rack',               9.14),
  ('A0-7VIA-W1E0',          'B08WNJ6JMH', 'X001J1SPYZ', 'S2C Dish Rack Dish Drying Stand Dish Drainer Plate Rack - Large Antibacterial Kitchen Utensils Dish Racks (STYLE A)',                                                                'Home and Kitchen','Dish Rack',              18.59),
  ('VX-31ID-3LZ2',          'B08WNQRQB7', 'X001BJ17R7', 'S2C Dish Rack Dish Drying Stand Dish Drainer Plate Rack - Large Antibacterial Kitchen Utensils (Single Tier)',                                                                       'Home and Kitchen','Dish Rack',               9.25),
  ('KF-M530-I02Y',          'B09NJPJ6NP', 'X001ED2NIR', 'S2C Puppy Toys Gift Set for Small Dogs, 7 Pack Small Dog Toys Cat Toys, Cute Squeaky Dog Toys (7 PCS DOG STYLE)',                                                                    'Pet Supplies',    'Dog toys',                9.96),
  ('18OZSWBMIX1',           'B0CYLW2G86', 'X001SK8WIV', 'S2C 550ml Leakproof Stainless Steel Water Bottle for Kids With Straw & Handle | BPA Free',                                                                                           'Water Bottles',   'Kids Bottle - Zaafi',    14.10),
  ('18OZSWBPINK',           'B0CYLWL9WM', 'X001ZMROQD', 'S2C 550ml Leakproof Stainless Steel Water Bottle for Kids With Straw & Handle | BPA Free (PINK)',                                                                                    'Water Bottles',   'Kids Bottle - Zaafi',    14.10),
  ('18OZSWBGREEN',          'B0CYLWTTRG', 'X001ZMS8N1', 'S2C 550ml LeakProof Stainless Steel Water Bottle for Kids With Straw & Handle | BPA Free',                                                                                           'Water Bottles',   'Kids Bottle - Zaafi',    14.10),
  ('18OZSWBBLUE',           'B0CYMQ56GH', 'X001ZMX01L', 'S2C 550ml Stainless Steel Water Bottle for Kids With Straw & Handle | Leakproof, BPA Free (BLUE)',                                                                                   'Water Bottles',   'Kids Bottle - Zaafi',    14.10),
  ('KIDSWBPURPLEPIGGY',     'B0CH9RTZXX', 'X001AMEG6T', 'S2C Kids Water Bottle with Straw & Handle - 16 oz BPA Free Kids Water Bottles, Spill Proof Cups for kids',                                                                           'Water Bottles',   'Kids Bottle - 16OZ',      7.18),
  ('KIDSPINKFLAMINGO',      'B0CHY5NZ2C', 'X001UWVKIB', 'S2C Kids Water Bottle with Straw & Handle - 16 oz BPA Free Kids Water Bottles, Spill Proof Cups for kids',                                                                           'Water Bottles',   'Kids Bottle - 16OZ',      7.18),
  ('18OZWBSEAGREEN',        'B0CMCLKHRL', 'X001V8BATN', 'S2C Kids Water Bottle with Straw Lid – 550ml Stainless Steel, Double Wall Insulated, BPA-Free (AQUA)',                                                                               'Water Bottles',   'Kids Bottle - Printed',  14.36),
  ('18OZWBBSPACE',          'B0F6C8DFQQ', 'X001WDUMSH', 'S2C Kids Water Bottle with Straw Lid – 550ml Stainless Steel, Double Wall Insulated, BPA-Free (BLACK SPACE)',                                                                        'Water Bottles',   'Kids Bottle - Printed',  14.36),
  ('180ZWBBLACK',           'B0CM5SX335', 'X002AHMR8H', 'S2C Kids Water Bottle with Straw Lid – 550ml Stainless Steel, Double Wall Insulated, BPA-Free (BLACK)',                                                                              'Water Bottles',   'Kids Bottle - Printed',  14.36),
  ('18OZBABYWHALE',         'B0DXKBTJY1', 'X001WBUB3Z', 'S2C Kids Water Bottle with Straw Lid – 550ml Stainless Steel, Double Wall Insulated, BPA-Free (blue)',                                                                               'Water Bottles',   'Kids Bottle - Printed',  14.36),
  ('18OZWBBUBBLEGUM',       'B0CM8WWYJ9', 'X0028NL47N', 'S2C Kids Water Bottle with Straw Lid – 550ml Stainless Steel, Double Wall Insulated, BPA-Free (BUBBLE GUM)',                                                                         'Water Bottles',   'Kids Bottle - Printed',  14.36),
  ('18OZWBMUSHROOM',        'B0F6C5T215', 'X001WDBTH5', 'S2C Kids Water Bottle with Straw Lid – 550ml Stainless Steel, Double Wall Insulated, BPA-Free (MUSHROOM)',                                                                           'Water Bottles',   'Kids Bottle - Printed',  14.36),
  ('18OZWBBLUE',            'B0CM8LWN2C', 'X002AHWAF7', 'S2C Kids Water Bottle with Straw Lid – 550ml Stainless Steel, Double Wall Insulated, BPA-Free (NAVY BLUE)',                                                                          'Water Bottles',   'Kids Bottle - Printed',  14.36),
  ('18OZWBFLORAL',          'B0F18Z713B', 'X001GZD0P3', 'S2C Kids Water Bottle with Straw Lid – 550ml Stainless Steel, Double Wall Insulated, BPA-Free (PEACH)',                                                                              'Water Bottles',   'Kids Bottle - Printed',  14.36),
  ('18OZRAINBOW',           'B0DXKX2LGN', 'X0029BBTK1', 'S2C Kids Water Bottle with Straw Lid – 550ml Stainless Steel, Double Wall Insulated, BPA-Free (PINK)',                                                                               'Water Bottles',   'Kids Bottle - Printed',  14.36),
  ('18OZWBPINK',            'B0CM8P1K2R', 'X0028NL6M1', 'S2C Kids Water Bottle with Straw Lid – 550ml Stainless Steel, Double Wall Insulated, BPA-Free (PINK)',                                                                               'Water Bottles',   'Kids Bottle - Printed',  14.36),
  ('18OZWBPRPLBUG',         'B0F18ZK5M3', 'X001WD7IJ3', 'S2C Kids Water Bottle with Straw Lid – 550ml Stainless Steel, Double Wall Insulated, BPA-Free (PURPLE)',                                                                             'Water Bottles',   'Kids Bottle - Printed',  14.36),
  ('18OZWBSKYBLUE',         'B0CM8MRCGX', 'X0029B7AQN', 'S2C Kids Water Bottle with Straw Lid – 550ml Stainless Steel, Double Wall Insulated, BPA-Free (SKY BLUE)',                                                                           'Water Bottles',   'Kids Bottle - Printed',  14.36),
  ('KIDSWBBLUE',            'B0CGZT9463', 'X001LOD15X', 'S2C Water Bottle for Kids With Straw & Handle - 16 oz BPA Free Kids Water Bottles, Spill Proof Cups for kids',                                                                       'Water Bottles',   'Kids Bottle - 16OZ',      6.15),
  ('KIDSWBPINK',            'B0CGZVRNYB', 'X001UU8FGD', 'S2C Water Bottle for Kids With Straw & Handle - 16 oz BPA Free Kids Water Bottles, Spill Proof Cups for kids',                                                                       'Water Bottles',   'Kids Bottle - 16OZ',      6.15),
  ('COFFEEMAT3040BLACK',    'B0CWLK7DRF', 'X001WCO0J5', 'S2C Kitchen Mat, Dish Drying Mat, Anti Slip Coffee Mat, Big Size 30L x 40W, 3.5mm Thickness, High Absorbent (30*40 BLACK)',                                                          'Home and Kitchen','Kitchen Mat',             3.57),
  ('COFFEEMAT6040BLACK',    'B0CWLN1MKG', 'X001YY1373', 'S2C Kitchen Mat, Dish Drying Mat, Anti Slip Coffee Mat, Big Size 60L x 40W, 3.5mm Thickness, High Absorbent (60*40 BLACK)',                                                          'Home and Kitchen','Kitchen Mat',             5.79),
  ('COFFEMATGREY60x40',     'B0CT8LWLBL', 'X001YY6KJT', 'S2C Kitchen Mat, Dish Drying Mat, Anti Slip Coffee Mat, Big Size 60L x 40W, 3.5mm Thickness, High Absorbent (60*40 GREY)',                                                           'Home and Kitchen','Kitchen Mat',             8.08),
  ('GR-8W3U-HO7M',          'B00YFU7NAQ', 'X001EFKND7', 'S2C Professional Artist Paint Brushes set with Nylon Hair - Great for Acrylic, Face, Nail Art, Body Art, Miniature Detailing & Rock Painting',                                       'Art Supplies',    'Paint Brush',             4.43),
  ('175Pcs Party Supplies', 'B09GG2CL11', 'X001LP4XVD', 'S2C 175 PCS Rose Gold Party Supplies, Serves 25 Disposable Dinnerware Set (A-175 PCS)',                                                                                              'Home and Kitchen','Party Supplies',          14.87),
  ('S2C113',                'B098MST9MW', 'X001HVGNP5', 'S2C 175 Pcs Serves 25 Heavy Duty Black Gold Disposable Party Supplies (BLACK GOLD)',                                                                                                  'Home and Kitchen','Party Supplies',          14.87),
  ('175PCSPINKGOLD',        'B0C49XSL8R', 'X001EFJ2C5', 'S2C 175 Pcs Serves 25 Heavy Duty Pink Gold Disposable Party Supplies (PINK GOLD)',                                                                                                   'Home and Kitchen','Party Supplies',          14.87),
  ('GREYSLCNBWLSMALL',      'B0D1VLZSM7', 'X001K5R7NF', 'S2C Stainless Steel Pet Bowl, Non Slip Cat Bowl, Elevated Dog Bowl, Cat Food Bowl (GREY SMALL)',                                                                                     'Pet Supplies',    'Pet Bowls',               9.74),
  ('BLACKSILICONEBOWL',     'B0BWNGL5XX', 'X00208WIQ7', 'S2C Stainless Steel Pet Bowl, Non Slip Cat Bowl, Elevated Dog Bowl (SMALL SIZE, Black)',                                                                                              'Pet Supplies',    'Pet Bowls',              10.10),
  ('BLKSLCNBOWLLARGE',      'B0C58DZQWF', 'X001ZTQ6AV', 'S2C Stainless Steel Pet Bowl, Non-Slip Cat Bowl, Elevated Dog Bowl (Medium Size)',                                                                                                   'Pet Supplies',    'Pet Bowls',              10.20),
  ('S2C28PC',               'B0B53MVZPL', 'X001JANRNF', 'S2C 28 Pcs Cat Toys Interactive Accessories - Cat Accessories For Indoor Cats, Kitten Toys, Cat Tunnel And Tent',                                                                    'Pet Supplies',    'Pet Toys',                9.94),
  ('RCONTROLCARBLUE',       'B0CCDJ96FK', 'X001HIRSOD', 'S2C Remote Control Car, RC Cars Stunt Car Toy, 4WD 2.4Ghz Double Sided 360 Rotating RC Car with Headlights (Blue)',                                                                  'Baby and Toddlers','RC Cars',               14.10),
  ('STUNTCARGREEN',         'B0CJF3YCZ7', 'X001TM373X', 'S2C Remote Control Car, RC Cars Stunt Car Toy, 4WD 2.4Ghz Double Sided 360 Rotating RC Car with Headlights (Green)',                                                                 'Baby and Toddlers','RC Cars',               14.62),
  ('RCCARYELLOW',           'B0CNLLFLQ2', 'X001VEOF3Z', 'S2C Remote Control Car, RC Cars Stunt Car Toy, 4WD 2.4Ghz Double Sided 360 Rotating RC Car with Headlights (MUSTARD YELLOW)',                                                        'Baby and Toddlers','RC Cars',               14.10),
  ('RCONTROLCARRED',        'B0CCD1FMSQ', 'X001WQPT69', 'S2C Remote Control Car, RC Cars Stunt Car Toy, 4WD 2.4Ghz Double Sided 360 Rotating RC Car with Headlights (Red)',                                                                   'Baby and Toddlers','RC Cars',               14.13),
  ('100PCSSHOECHARMS',      'B0CFK68FZZ', 'X001X0YV4P', 'S2C Colorful Shoe Charms for Crocs, 100 PCS Random Shoe Charms for Unique Shoe Decor (100Pcs Random Shoe Charms)',                                                                   'Baby and Toddlers','Shoe Charms',            7.85),
  ('50PCSSHOECHARMS',       'B0CFK456HW', 'X001U92IYT', 'S2C Colorful Shoe Charms for Crocs, 50 PCS Random Shoe Charms for Unique Shoe Decor (50Pcs Random Shoe Charms)',                                                                     'Baby and Toddlers','Shoe Charms',            3.94),
  ('CRNRSHWERCADDYBLACK',   'B0CZJHF8RP', 'X0029HHQFR', 'S2C Wall Mounted Bathroom Shelf Heavy Duty, Rustproof Shower Caddy with Soap Holder, Stainless Steel Bathroom Organizer (PACK OF 3)',                                                'Home and Kitchen','Shower Caddy',           13.87),
  ('WALLSHWRCADDY',         'B0CZKTSWGD', 'X001ZW2XM3', 'S2C Wall Mounted Bathroom Shelf Heavy Duty, Strong Adhesive, Rustproof Shower Caddy, Stainless Steel Bathroom Organizer',                                                            'Home and Kitchen','Shower Caddy',           10.00),
  ('XG-DHHL-HZJ4',          'B08RJW652D', 'X001BJ2W0N', 'S2C High-Pressure Ionic Shower Head – 3 Modes, Water Saving, Hard Water Filter, 250 Laser-Cut Spray Holes, EcoPower',                                                               'Home and Kitchen','Shower Head',             4.51),
  ('DE-3LDA-FHAZ',          'B09YZWL2Q9', 'X001K77AKX', 'S2C Shower Filter, High Pressure Shower Head with 3 Modes and Stop Button, Rainfall, Spa Water Saving Ionic Shower Head',                                                           'Home and Kitchen','Shower Head',             5.40),
  ('WB002-E',               'B09VH7K46P', 'X001RWHGUF', 'S2C 1 litre Water Bottle for Kids School Motivational Water Bottle with Straw Leak Proof (MISTY ROSE)',                                                                              'Water Bottles',   'Sports Water Bottle',     6.54),
  ('2W-EDFH-4MBZ',          'B09C4PWZZ4', 'X001WVL625', 'S2C Motivational Large Water Bottle 1L Tritan Plastic Water Bottle With Time Markers, Leak Proof (GREEN & PINK)',                                                                    'Water Bottles',   'Sports Water Bottle',     4.62),
  ('WB002-D',               'B09VH7BK1V', 'X001F205M3', 'S2C Motivational Water Bottle 1l for Kids School with Straw Leak Proof With Time Marker (GRADIENT BLUE)',                                                                            'Water Bottles',   'Sports Water Bottle',     6.54),
  ('WB002-A',               'B09VH7YC5F', 'X001JANRHV', 'S2C Motivational Water Bottle 1l for Kids School with Straw Leak Proof With Time Marker (GRADIENT GREY)',                                                                            'Water Bottles',   'Sports Water Bottle',     6.54),
  ('WB002-C',               'B09VH5VYX1', 'X001JARPA1', 'S2C Motivational Water Bottle 1l for Kids School with Straw Leak Proof With Time Marker (GRADIENT PURPLE)',                                                                          'Water Bottles',   'Sports Water Bottle',     6.54),
  ('WB002-B',               'B09VH7LL3H', 'X001JANY5V', 'S2C Motivational Water Bottle 1l for Kids School with Straw Leak Proof With Time Marker (GRADIENT PINK)',                                                                            'Water Bottles',   'Sports Water Bottle',     6.54),
  ('BC-1XS1-4Q6N',          'B09Z6X4T1L', 'X001VERZXR', 'S2C Motivational Large Water Bottle 1L Tritan Plastic Water Bottle With Time Markers, Leak Proof (BLUE)',                                                                            'Water Bottles',   'Sports Water Bottle',     4.62),
  ('1LWBGREYWHITE',         'B09XXYWDQH', 'X0027OZUY1', 'S2C Motivational Large Water Bottle 1L Tritan Plastic Water Bottle With Time Markers, Leak Proof (GREY & WHITE)',                                                                    'Water Bottles',   'Sports Water Bottle',     4.62),
  ('KS-N831-CJVJ',          'B09C4PCW35', 'X001JX22MJ', 'S2C Motivational Large Water Bottle 1L Tritan Plastic Water Bottle With Time Markers, Leak Proof (GREY)',                                                                            'Water Bottles',   'Sports Water Bottle',     4.62),
  ('VY-9BCZ-9J69',          'B09C4Q1PK6', 'X001F1Z0KV', 'S2C Motivational Large Water Bottle 1L Tritan Plastic Water Bottle With Time Markers, Leak Proof (PINK & BLUE)',                                                                     'Water Bottles',   'Sports Water Bottle',     4.62),
  ('7Q-KYD0-LK9W',          'B09XY3YY9G', 'X001F20NT3', 'S2C Motivational Large Water Bottle 1L Tritan Plastic Water Bottle With Time Markers, Leak Proof (PINK)',                                                                            'Water Bottles',   'Sports Water Bottle',     4.62),
  ('Y5-Z9FX-A7ZF',          'B09C4QBVL9', 'X001JX2IZF', 'S2C Motivational Large Water Bottle 1L Tritan Plastic Water Bottle With Time Markers, Leak Proof (PURPLE & PINK)',                                                                  'Water Bottles',   'Sports Water Bottle',     4.62),
  ('BLUEORANGE1L',           'B0BX6WB5K6', 'X001F2073P', 'S2C Motivational Large Water Bottle 1L Tritan Plastic Water Bottle With Time Markers, Leak Proof (BLUE-ORANGE)',                                                                    'Water Bottles',   'Sports Water Bottle',     4.62),
  ('BLUEPINK1L',             'B0BX6VG14T', 'X001QE57UZ', 'S2C Motivational Large Water Bottle 1L Tritan Plastic Water Bottle With Time Markers, Leak Proof (BLUE-PINK)',                                                                      'Water Bottles',   'Sports Water Bottle',     4.62),
  ('57-3HRH-306S',           'B09C4PR41N', 'X001QE506L', 'S2C Motivational Large Water Bottle 1L Tritan Sports Water Bottle With Time Markers, Leak Proof (GREEN)',                                                                           'Water Bottles',   'Sports Water Bottle',     4.62),
  ('SINKORGNZRPCK1',         'B0D5V925F7', 'X001JALJIZ', 'S2C Non-Slip Under Sink Organizer, Multi-Purpose Organizer With Hooks & Cup, Sliding Drawers (1 Pack)',                                                                             'Home and Kitchen','Under Sink Organizer',    6.15),
  ('SINKORGNZR2PCK',         'B0D5VGN1JL', 'X0021KFJND', 'S2C Non-Slip Under Sink Organizer, Multi-Purpose Organizer With Hooks & Cup, Sliding Drawers (2 Pack)',                                                                             'Home and Kitchen','Under Sink Organizer',   12.31),
  ('UG-YOYG-1N4G',           'B082K5XKK2', 'X001EFKND7', 'S2C Professional Artist Paint Brushes set with Case, Nylon Hair Painting Brush (12 WITH CASE)',                                                                                    'Art Supplies',    'Paint Brush',             4.43),
  ('EA-QVX0-EUJK',           'B09GB1NB9B', 'X001FS9AAZ', 'S2C Wall Mounted Bathroom Shelf Heavy Duty, Rustproof Shower Caddy with Soap Holder, Stainless Steel (SILVER)',                                                                     'Home and Kitchen','Shower Caddy',             0),
  ('PTSLY-WB-04',            'B09LYN8HFM', 'X001GZD0P3', 'S2C Kids Water Bottle with Straw Lid – 550ml Stainless Steel, Double Wall Insulated, BPA-Free (OMBRE)',                                                                            'Water Bottles',   'Kids Bottle - Printed',    0),
  ('AZ-465T-K5NX',           'B09TR8QB1W', 'X001J1QZ5B', 'Dish Rack Dish Drying Stand Small Dish Rack with Tray - Countertop Black Kitchen Utensils (TWO LEVEL)',                                                                             'Home and Kitchen','Dish Rack',                0),
  ('WB15LPURPLE',            'B0B6PV3VM9', 'X001LOD15X', 'S2C WATER BOTTLE 1.5L LEAKPROOF GYM BOTTLE SPORTS WATER BOTTLE FOR KIDS SCHOOL (PURPLE)',                                                                                           'Water Bottles',   '40oz',                     0),
  ('5MODESHOWERWHOSE',       'B0C7VGKN1F', 'X001SRQF1Z', 'S2C 5 Modes Shower Head with 1.5m Hose and Holder - High Pressure Shower Head Set (Shower + Shower Hose)',                                                                          'Home and Kitchen','Shower Head',               0),
  ('5MODESHOWER',            'B0C7VHY17R', 'X001SRMTCT', 'S2C 5 Modes Shower Head with 1.5m Hose and Holder - High Pressure Shower Head Set (Shower Only)',                                                                                   'Home and Kitchen','Shower Head',               0),
  ('STUNTCARYELLOW',         'B0CJDWZQ5T', 'X001VERZXR', 'S2C Remote Control Car, RC Cars Stunt Car Toy, 4WD 2.4Ghz Double Sided 360 Rotating RC Car with Headlights (Yellow)',                                                               'Baby and Toddlers','RC Cars',               14.13),
  ('32OZDRAINBOW',           'B0F542MPJK', 'X002D7S61B', 'S2C Stainless Steel Water Bottle 1L, 32oz Double Wall Vacuum Insulated Water Bottle, BPA Free with Spout Lid (DARK RAINBOW)',                                                        'Water Bottles',   '32oz Spout',             11.79),
  ('14OZWBPEACH',            'B0FJLTMNYG', 'X002D1X3PB', 'S2C Kids Insulated Water Bottle 14oz – Stainless Steel, Leak-Proof, BPA-Free, Double Wall Vacuum Flask with Straw Lid & Handle (PEACH)',                                             'Water Bottles',   'Kids Bottle - Zaafi 14', 13.33),
  ('14OZWBPYELLOW',          'B0FJLVD6N8', 'X002D1UR2X', 'S2C Kids Insulated Water Bottle 14oz – Stainless Steel, Leak-Proof, BPA-Free, Double Wall Vacuum Flask with Straw Lid & Handle (PASTEL YELLOW)',                                    'Water Bottles',   'Kids Bottle - Zaafi 14', 13.33)
ON CONFLICT (sku) DO UPDATE SET
  asin                 = EXCLUDED.asin,
  fnsku                = EXCLUDED.fnsku,
  title                = EXCLUDED.title,
  product_category     = EXCLUDED.product_category,
  product_sub_category = EXCLUDED.product_sub_category,
  cogs                 = EXCLUDED.cogs;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Sync product_category, sub_category, fnsku, asin, cogs back to sku_master
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE sku_master sm
SET
  product_category = pc.product_category,
  sub_category     = pc.product_sub_category,
  fnsku            = COALESCE(sm.fnsku, pc.fnsku),
  asin             = COALESCE(sm.asin, pc.asin),
  cogs             = COALESCE(NULLIF(sm.cogs, 0), pc.cogs)
FROM product_catalog pc
WHERE sm.sku = pc.sku;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Fix sku_master moq + units_per_box
--    Migration 003 used wrong SKU names (trailing 'S' appended). These are
--    the correct names matching actual sku_master records.
-- ─────────────────────────────────────────────────────────────────────────────

-- Lunch Box 2-comp & 3-comp
UPDATE sku_master SET units_per_box = 20, moq = 100 WHERE sku IN (
  'WHALEBLUE-2COMP-LB','BUGPURPLE-2COMP-LB','RAINBOW-2COMP-LB',
  'WHALEBLUE-3COMP-LB','RAINBOW-3COMP-LB','BUGPURPLE-3COMP-LB'
);

-- Art Supplies
UPDATE sku_master SET units_per_box = 40, moq = 120 WHERE sku = '24ACRYLICCOMBO';
UPDATE sku_master SET units_per_box = 48, moq = 96  WHERE sku = 'SE-YYC0-6GAQ';
UPDATE sku_master SET units_per_box = 24, moq = 96  WHERE sku = '36ACRYLICCOLORS';
UPDATE sku_master SET units_per_box = 25, moq = 100 WHERE sku = 'V8-0T2I-663N';
UPDATE sku_master SET units_per_box = 200,moq = 200 WHERE sku IN ('GR-8W3U-HO7M','UG-YOYG-1N4G');

-- 30oz Tumblers
UPDATE sku_master SET units_per_box = 25, moq = 100 WHERE sku IN (
  '30OZTBLACK','30OZTBLUE','30OZTGREEN','30OZTMOCHA','30OZTPINK','30OZTALPHINE'
);

-- 40oz Tumblers
UPDATE sku_master SET units_per_box = 20, moq = 100 WHERE sku IN (
  '40OZTALPINE','40OZTBLACK','40OZTBLUE','40OZTGREEN','40OZTMOCHA','40OZTPINK'
);

-- 32oz Spout Water Bottles
UPDATE sku_master SET units_per_box = 25, moq = 100 WHERE sku IN (
  '32OZWBNAVYBLUE','32OZDARKNIGHT','32OZWBPURPLE','32OZWBBLACKNEW',
  '320ZWBROSEPINK','320ZWBGREY','320ZWBORANGE','BH-JUJ1-WPO5',
  '32OZWBGREENNEW','32OZWBSKYLUE','32OZWBWHITE','32OZWBYELLOW','32OZDRAINBOW'
);

-- 32oz Straw Water Bottles
UPDATE sku_master SET units_per_box = 25, moq = 100 WHERE sku IN (
  '32OZSTRAWLIDBLACK','32OZSTRAWLIDGREEN','32OZSTRAWLIDNAVYBLUE',
  '32OZSTRAWLIDPINK','32OZSTRAWLIDSKYBLUE'
);

-- 32oz 2-in-1 Water Bottles
UPDATE sku_master SET units_per_box = 25, moq = 100 WHERE sku IN (
  '32OZWBRED','32OZPINK2IN1','32OZDRAIN2IN1','32OZBLACK2IN1','32OZNAVY2IN1'
);

-- 40oz Water Bottles
UPDATE sku_master SET units_per_box = 25, moq = 100 WHERE sku IN (
  '40OZSEAGREEN','40OZBUBBLEGUM','40OZDARKNIGHT','40OZSKY',
  '400ZBLACK','400ZBLUE','40OZDARKRAINBOW','400ZGRAPHITE','40OZGREEN','WB15LPURPLE'
);

-- 500ml Water Bottles
UPDATE sku_master SET units_per_box = 25, moq = 100 WHERE sku IN (
  '500MLBLACK','500MLPEACH','WB500mlGREEN','500MLGREEN','500MLTEAPINK'
);

-- 750ml Water Bottles
UPDATE sku_master SET units_per_box = 25, moq = 100 WHERE sku IN (
  'WB750MLBLACK','WB750MLBLUE','WB750MLSGREEN','WB750MLGREY','WB750mlPEACH',
  'WB750mlPURPLE','WB750MLRED','WB750mlSILVER','WB750MLPINK','9J-YOUU-HW3U','WB750MLYELLOW'
);

-- Baby Feeding Sets
UPDATE sku_master SET units_per_box = 20, moq = 100 WHERE sku IN (
  '5PCPINKNEW','5PCSKYBLUE','5PCGREYNEW','5PCSLIGHTPINK','5PCBLUENEW',
  '6PCBLUENEW','6PCPINKNEW','6PCSLIGHTBLUE','6PCGREYNEW','6PCSLIGHTPINK'
);

-- Pet Supplies
UPDATE sku_master SET units_per_box = 32, moq = 128 WHERE sku IN ('LITTERMATMEDIUM','LITTERMATLARGE');
UPDATE sku_master SET units_per_box = 25, moq = 100 WHERE sku = 'CATSCRATCHPAD60x40';
UPDATE sku_master SET units_per_box = 20, moq = 100 WHERE sku IN ('CATBEDWBLNKT','CATWINDWBED');
UPDATE sku_master SET units_per_box = 36, moq = 108 WHERE sku = 'KF-M530-I02Y';
UPDATE sku_master SET units_per_box = 30, moq = 150 WHERE sku IN ('GREYSLCNBWLSMALL','BLACKSILICONEBOWL');
UPDATE sku_master SET units_per_box = 15, moq = 105 WHERE sku = 'BLKSLCNBOWLLARGE';
UPDATE sku_master SET units_per_box = 35, moq = 105 WHERE sku = 'S2C28PC';

-- Health
UPDATE sku_master SET units_per_box = 32, moq = 128 WHERE sku IN ('JU-XL02-EHTG','DENTALFLOSSER');

-- Home and Kitchen – Dish Rack
UPDATE sku_master SET units_per_box = 5,  moq = 100 WHERE sku IN ('IW-OT00-2JCP','VX-31ID-3LZ2','EA-QVX0-EUJK');
UPDATE sku_master SET units_per_box = 8,  moq = 120 WHERE sku IN ('A0-7VIA-W1E0','AZ-465T-K5NX');

-- Home and Kitchen – Kitchen Mat
UPDATE sku_master SET units_per_box = 60, moq = 120 WHERE sku = 'COFFEEMAT3040BLACK';
UPDATE sku_master SET units_per_box = 40, moq = 120 WHERE sku IN ('COFFEEMAT6040BLACK','COFFEMATGREY60x40');

-- Home and Kitchen – Party Supplies
UPDATE sku_master SET units_per_box = 12, moq = 120 WHERE sku IN ('175Pcs Party Supplies','S2C113','175PCSPINKGOLD');

-- Home and Kitchen – Shower Caddy
UPDATE sku_master SET units_per_box = 16, moq = 112 WHERE sku = 'CRNRSHWERCADDYBLACK';
UPDATE sku_master SET units_per_box = 12, moq = 120 WHERE sku = 'WALLSHWRCADDY';
UPDATE sku_master SET units_per_box = 5,  moq = 100 WHERE sku = 'EA-QVX0-EUJK';

-- Home and Kitchen – Shower Head
UPDATE sku_master SET units_per_box = 50, moq = 100 WHERE sku IN ('XG-DHHL-HZJ4','DE-3LDA-FHAZ','5MODESHOWER');
UPDATE sku_master SET units_per_box = 75, moq = 150 WHERE sku = '5MODESHOWERWHOSE';

-- Home and Kitchen – Under Sink Organizer
UPDATE sku_master SET units_per_box = 24, moq = 120 WHERE sku = 'SINKORGNZRPCK1';
UPDATE sku_master SET units_per_box = 12, moq = 120 WHERE sku = 'SINKORGNZR2PCK';

-- Kids Water Bottles – Zaafi 18oz
UPDATE sku_master SET units_per_box = 25, moq = 200 WHERE sku IN (
  '18OZSWBMIX1','18OZSWBPINK','18OZSWBGREEN','18OZSWBBLUE'
);

-- Kids Water Bottles – Zaafi 14oz
UPDATE sku_master SET units_per_box = 25, moq = 200 WHERE sku IN (
  '14OZWBPEACH','14OZWBPYELLOW'
);

-- Kids Water Bottles – Printed 18oz
UPDATE sku_master SET units_per_box = 25, moq = 100 WHERE sku IN (
  '18OZWBSEAGREEN','18OZWBBSPACE','180ZWBBLACK','18OZBABYWHALE','18OZWBBUBBLEGUM',
  '18OZWBMUSHROOM','18OZWBBLUE','18OZWBFLORAL','18OZRAINBOW','18OZWBPINK',
  '18OZWBPRPLBUG','18OZWBSKYBLUE','PTSLY-WB-04','18OZPINKDOLPHIN'
);

-- Kids Water Bottles – 16oz
UPDATE sku_master SET units_per_box = 50, moq = 100 WHERE sku IN (
  'KIDSWBPURPLEPIGGY','KIDSPINKFLAMINGO','KIDSWBBLUE','KIDSWBPINK'
);

-- RC Cars
UPDATE sku_master SET units_per_box = 24, moq = 120 WHERE sku IN (
  'RCONTROLCARBLUE','STUNTCARGREEN','RCCARYELLOW','RCONTROLCARRED','STUNTCARYELLOW'
);

-- Shoe Charms
UPDATE sku_master SET units_per_box = 100, moq = 100 WHERE sku IN ('100PCSSHOECHARMS','50PCSSHOECHARMS');

-- Sports Water Bottles – 1L
UPDATE sku_master SET units_per_box = 60, moq = 120 WHERE sku IN (
  'WB002-E','2W-EDFH-4MBZ','WB002-D','WB002-A','WB002-C','WB002-B',
  'BC-1XS1-4Q6N','1LWBGREYWHITE','KS-N831-CJVJ','VY-9BCZ-9J69',
  '7Q-KYD0-LK9W','Y5-Z9FX-A7ZF','BLUEORANGE1L','BLUEPINK1L','57-3HRH-306S'
);
