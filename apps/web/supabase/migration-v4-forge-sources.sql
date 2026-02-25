-- Migration v4: Expand forge_harvest source CHECK constraint
-- The original constraint only allowed 5 sources but the harvester supports 10.
-- This caused HTTP 500 when harvesting from reddit, devto, mdn, wikipedia, or hackernews.

ALTER TABLE forge_harvest DROP CONSTRAINT IF EXISTS forge_harvest_source_check;
ALTER TABLE forge_harvest ADD CONSTRAINT forge_harvest_source_check
  CHECK (source IN ('github','stackoverflow','docs','blog','dataset','reddit','devto','mdn','wikipedia','hackernews'));
