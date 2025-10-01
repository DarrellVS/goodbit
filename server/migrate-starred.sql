-- Migration to add starred column and set default values
-- Run this if you have existing clips that don't have the starred field

-- For SQLite, if the column doesn't exist yet, it will be added by TypeORM
-- This script just ensures all existing rows have starred = 0 (false) if they're NULL

UPDATE clip SET starred = 0 WHERE starred IS NULL;

