#!/usr/bin/env node
'use strict';

/**
 * One-time / occasional import of approved testers into Supabase.
 *
 * Reads a local CSV (e.g. a Typeform export) and upserts only the name +
 * email columns into `approved_testers`. Everything else in the CSV is
 * discarded — no other survey data is ever sent to Supabase.
 *
 * Usage:
 *   node --env-file=.env scripts/import-testers.js "C:\path\to\testers.csv"
 *   node --env-file=.env scripts/import-testers.js "C:\path\to\testers.csv" --dry-run
 *   node --env-file=.env scripts/import-testers.js "C:\path\to\testers.csv" --name-column "Full name" --email-column "Email address"
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
 * No npm packages required — uses Node's built-in fetch and fs only.
 */

const fs = require('fs');
const path = require('path');

function parseCsv(content) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\r') {
      // ignore; \n (below) closes the row
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

function normalizeHeader(h) {
  return h.trim().toLowerCase();
}

function findColumnIndex(headers, explicit, fuzzyKeyword) {
  if (explicit) {
    const idx = headers.findIndex((h) => normalizeHeader(h) === normalizeHeader(explicit));
    if (idx === -1) {
      throw new Error(
        `Column "${explicit}" not found. Available columns:\n` +
          headers.map((h, i) => `  [${i}] ${h}`).join('\n'),
      );
    }
    return idx;
  }

  const idx = headers.findIndex((h) => normalizeHeader(h).includes(fuzzyKeyword));
  if (idx === -1) {
    throw new Error(
      `Could not auto-detect a "${fuzzyKeyword}" column. Available columns:\n` +
        headers.map((h, i) => `  [${i}] ${h}`).join('\n') +
        `\nRe-run with --${fuzzyKeyword}-column "<exact header text>" to specify it manually.`,
    );
  }
  return idx;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--name-column') args.nameColumn = argv[++i];
    else if (a === '--email-column') args.emailColumn = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else args._.push(a);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const csvPath = args._[0];

  if (!csvPath) {
    console.error(
      'Usage: node --env-file=.env scripts/import-testers.js <path-to-csv> [--name-column "Header"] [--email-column "Header"] [--dry-run]',
    );
    process.exit(1);
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with: node --env-file=.env scripts/import-testers.js ...',
    );
    process.exit(1);
  }

  const raw = fs.readFileSync(path.resolve(csvPath), 'utf8');
  const rows = parseCsv(raw);

  if (rows.length < 2) {
    console.error('CSV appears to have no data rows.');
    process.exit(1);
  }

  const headers = rows[0];
  const nameIdx = findColumnIndex(headers, args.nameColumn, 'name');
  const emailIdx = findColumnIndex(headers, args.emailColumn, 'email');

  console.log(`Using column [${nameIdx}] "${headers[nameIdx]}" for name`);
  console.log(`Using column [${emailIdx}] "${headers[emailIdx]}" for email`);

  const seen = new Set();
  const records = [];
  let skippedEmpty = 0;
  let skippedDupe = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const fullName = (r[nameIdx] || '').trim();
    const email = (r[emailIdx] || '').trim();

    if (!fullName || !email) {
      skippedEmpty++;
      continue;
    }

    const emailNormalized = email.toLowerCase();
    if (seen.has(emailNormalized)) {
      skippedDupe++;
      continue;
    }

    seen.add(emailNormalized);
    records.push({ full_name: fullName, email });
  }

  console.log(
    `Parsed ${rows.length - 1} data rows -> ${records.length} valid, ` +
      `${skippedEmpty} skipped (missing name/email), ${skippedDupe} skipped (duplicate email in file)`,
  );

  if (args.dryRun) {
    console.log('Dry run — nothing written to Supabase. First 5 records:');
    console.log(records.slice(0, 5));
    return;
  }

  const CHUNK_SIZE = 500;
  let imported = 0;

  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);

    const res = await fetch(`${SUPABASE_URL}/rest/v1/approved_testers?on_conflict=email_normalized`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        // merge-duplicates: re-running the import updates full_name/email
        // for existing rows but never touches status, reimbursement_amount,
        // etc. — so it can't accidentally reset a tester who already applied.
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(chunk),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`Batch starting at row ${i} failed: ${res.status} ${body}`);
      process.exit(1);
    }

    const inserted = await res.json();
    imported += inserted.length;
    console.log(`Upserted batch ${Math.floor(i / CHUNK_SIZE) + 1}: ${inserted.length} rows`);
  }

  console.log(`Done. ${imported} approved testers upserted.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
