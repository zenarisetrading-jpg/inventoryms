// =============================================================================
// Supabase Edge Function: sync-inventory-age
// 
// Synchronizes the `inventory_age` table from a Source Supabase project
// to a Destination Supabase project.
//
// Schema: inventory_age (
//   report_date  DATE    NOT NULL,   -- PK
//   account_id   TEXT    NOT NULL,   -- PK
//   sku          TEXT    NOT NULL,   -- PK
//   bucket       TEXT    NOT NULL,   -- PK
//   item_count   INTEGER NOT NULL DEFAULT 0
// )
//
// Primary Key: (report_date, account_id, sku, bucket)
//
// Environment Variables:
//   SOURCE_SUPABASE_URL      - API URL of the source project (e.g. https://xxx.supabase.co)
//   SOURCE_SERVICE_ROLE_KEY  - Service role key for the source project
//   DEST_SUPABASE_URL        - API URL of the destination project
//   DEST_SERVICE_ROLE_KEY    - Service role key for the destination project
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const TABLE_NAME = "inventory_age";
const BATCH_SIZE = 1000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000; // Base delay, doubles each retry (exponential backoff)

// ---------------------------------------------------------------------------
// Utility: Sleep for a given number of milliseconds
// ---------------------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Utility: Retry wrapper with exponential backoff
// ---------------------------------------------------------------------------
async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(
        `[Retry] ${label} - Attempt ${attempt}/${retries} failed: ${lastError.message}`
      );
      if (attempt < retries) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`[Retry] Waiting ${delay}ms before next attempt...`);
        await sleep(delay);
      }
    }
  }
  throw new Error(`[${label}] All ${retries} attempts failed. Last error: ${lastError?.message}`);
}

// ---------------------------------------------------------------------------
// Fetch total record count from a table
// ---------------------------------------------------------------------------
async function fetchCount(client: SupabaseClient, table: string): Promise<number> {
  const { count, error } = await client
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) {
    throw new Error(`Failed to fetch count from ${table}: ${error.message}`);
  }
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Fetch a batch of records from the source table
// ---------------------------------------------------------------------------
async function fetchBatch(
  client: SupabaseClient,
  table: string,
  offset: number,
  limit: number
): Promise<Record<string, unknown>[]> {
  const { data, error } = await client
    .from(table)
    .select("*")
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to fetch batch at offset ${offset}: ${error.message}`);
  }
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Upsert a batch of records into the destination table
// ---------------------------------------------------------------------------
async function upsertBatch(
  client: SupabaseClient,
  table: string,
  batch: Record<string, unknown>[]
): Promise<void> {
  // onConflict specifies the composite primary key columns so Supabase
  // knows which columns to use for the UPSERT conflict resolution.
  const { error } = await client
    .from(table)
    .upsert(batch, {
      onConflict: "report_date,account_id,sku,bucket",
      ignoreDuplicates: false,
    });

  if (error) {
    throw new Error(`Failed to upsert batch: ${error.message} (code: ${error.code})`);
  }
}

// ---------------------------------------------------------------------------
// Main sync handler
// ---------------------------------------------------------------------------
serve(async (_req: Request) => {
  const startTime = Date.now();
  let recordsSynced = 0;
  let totalFetched = 0;

  try {
    // ----- 1. Load and validate environment variables -----------------------
    const SOURCE_URL = Deno.env.get("SOURCE_SUPABASE_URL");
    const SOURCE_KEY = Deno.env.get("SOURCE_SERVICE_ROLE_KEY");
    const DEST_URL = Deno.env.get("DEST_SUPABASE_URL");
    const DEST_KEY = Deno.env.get("DEST_SERVICE_ROLE_KEY");

    if (!SOURCE_URL || !SOURCE_KEY || !DEST_URL || !DEST_KEY) {
      const missing = [
        !SOURCE_URL && "SOURCE_SUPABASE_URL",
        !SOURCE_KEY && "SOURCE_SERVICE_ROLE_KEY",
        !DEST_URL && "DEST_SUPABASE_URL",
        !DEST_KEY && "DEST_SERVICE_ROLE_KEY",
      ].filter(Boolean);
      throw new Error(`Missing environment variables: ${missing.join(", ")}`);
    }

    console.log(`[sync] Starting sync for table: ${TABLE_NAME}`);
    console.log(`[sync] Source: ${SOURCE_URL}`);
    console.log(`[sync] Destination: ${DEST_URL}`);

    // ----- 2. Initialize Supabase clients -----------------------------------
    const sourceClient = createClient(SOURCE_URL, SOURCE_KEY, {
      auth: { persistSession: false },
    });
    const destClient = createClient(DEST_URL, DEST_KEY, {
      auth: { persistSession: false },
    });

    // ----- 3. Fetch total record count from source --------------------------
    const totalRecords = await withRetry("fetchCount", () =>
      fetchCount(sourceClient, TABLE_NAME)
    );
    console.log(`[sync] Total records in source: ${totalRecords}`);

    if (totalRecords === 0) {
      const execTime = ((Date.now() - startTime) / 1000).toFixed(1) + "s";
      console.log(`[sync] Source table is empty. Nothing to sync.`);
      return new Response(
        JSON.stringify({
          success: true,
          table: TABLE_NAME,
          records_synced: 0,
          execution_time: execTime,
          message: "Source table is empty. Nothing to sync.",
        }),
        { headers: { "Content-Type": "application/json" }, status: 200 }
      );
    }

    // ----- 4. Batch fetch from source and upsert into destination -----------
    for (let offset = 0; offset < totalRecords; offset += BATCH_SIZE) {
      const batchNum = Math.floor(offset / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(totalRecords / BATCH_SIZE);
      console.log(`[sync] Processing batch ${batchNum}/${totalBatches} (offset: ${offset})`);

      // Fetch batch with retry
      const batch = await withRetry(`fetchBatch(offset=${offset})`, () =>
        fetchBatch(sourceClient, TABLE_NAME, offset, BATCH_SIZE)
      );

      if (batch.length === 0) {
        console.log(`[sync] Empty batch at offset ${offset}, ending.`);
        break;
      }

      totalFetched += batch.length;

      // Upsert batch with retry
      await withRetry(`upsertBatch(offset=${offset})`, () =>
        upsertBatch(destClient, TABLE_NAME, batch)
      );

      recordsSynced += batch.length;
      console.log(
        `[sync] Batch ${batchNum}: fetched=${batch.length}, synced=${recordsSynced}/${totalRecords}`
      );
    }

    // ----- 5. Verify counts match -------------------------------------------
    const destCount = await withRetry("destCount", () =>
      fetchCount(destClient, TABLE_NAME)
    );
    console.log(`[sync] Destination count after sync: ${destCount}`);

    const countsMatch = destCount >= totalRecords;
    if (!countsMatch) {
      console.warn(
        `[sync] WARNING: Source count (${totalRecords}) != Destination count (${destCount})`
      );
    }

    // ----- 6. Build success response ----------------------------------------
    const execTime = ((Date.now() - startTime) / 1000).toFixed(1) + "s";
    console.log(`[sync] Completed in ${execTime}. Records synced: ${recordsSynced}`);

    return new Response(
      JSON.stringify({
        success: true,
        table: TABLE_NAME,
        source_count: totalRecords,
        destination_count: destCount,
        records_synced: recordsSynced,
        records_fetched: totalFetched,
        counts_match: countsMatch,
        execution_time: execTime,
        message: "Inventory Age synced successfully.",
      }),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    // ----- Error response ---------------------------------------------------
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[sync] ERROR: ${errMsg}`);
    const execTime = ((Date.now() - startTime) / 1000).toFixed(1) + "s";

    return new Response(
      JSON.stringify({
        success: false,
        table: TABLE_NAME,
        records_synced: recordsSynced,
        records_fetched: totalFetched,
        execution_time: execTime,
        error: errMsg,
        message: "Inventory Age sync failed.",
      }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }
});
