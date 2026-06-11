-- Renamings der Ausgaben-Kategorien auf neue BetrKV-Struktur
UPDATE `expenses` SET `category` = 'bk_grundsteuer'     WHERE `category` = 'land_tax';--> statement-breakpoint
UPDATE `expenses` SET `category` = 'bk_versicherung'    WHERE `category` = 'insurance';--> statement-breakpoint
UPDATE `expenses` SET `category` = 'non_allocable_other' WHERE `category` = 'non_allocable_costs';
