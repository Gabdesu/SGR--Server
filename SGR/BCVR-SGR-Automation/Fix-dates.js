/**
 * fix-dates.js  (v2)
 *
 * Run once from the project root:  node fix-dates.js
 *
 * Does THREE things to every controllers/<branch>/*.js file:
 *
 *  1. Adds { DATE } to the existing require('../../config') import.
 *  2. Replaces every hardcoded DECLARE/SET/WHERE date value with
 *     a ${DATE.sql.*} placeholder.
 *  3. Converts any query string that now contains ${...} but is
 *     still wrapped in regular quotes ( ' or " ) into a backtick
 *     template literal so JS actually evaluates the interpolation.
 */

const fs   = require('fs');
const path = require('path');

const CONTROLLERS_DIR = path.join(__dirname, 'controllers');

// ─────────────────────────────────────────────────────────────
//  STEP 1 — IMPORT PATCHER
// ─────────────────────────────────────────────────────────────
function patchImport(content) {
    return content.replace(
        /const\s*\{([^}]+)\}\s*=\s*require\(['"]\.\.\/\.\.\/config['"]\)/,
        (match, imports) => {
            const parts = imports.split(',').map(s => s.trim()).filter(Boolean);
            if (!parts.includes('DATE')) parts.push('DATE');
            return `const { ${parts.join(', ')} } = require('../../config')`;
        }
    );
}

// ─────────────────────────────────────────────────────────────
//  STEP 2 — DATE VALUE REPLACEMENTS
// ─────────────────────────────────────────────────────────────
const PATTERNS = [
    {
        re: /DECLARE\s+@StartDate\s+DATE\s*=\s*'[^']*'/gi,
        to: `DECLARE @StartDate DATE = '\${DATE.sql.start}'`,
    },
    {
        re: /DECLARE\s+@EndDate\s+DATE\s*=\s*'[^']*'/gi,
        to: `DECLARE @EndDate   DATE = '\${DATE.sql.end}'`,
    },
    {
        re: /DECLARE\s+@Date_From\s+DateTime\s*=\s*'[^']*'/gi,
        to: `DECLARE @Date_From DateTime = '\${DATE.sql.datetimeStart}'`,
    },
    {
        re: /DECLARE\s+@Date_To\s+DateTime\s*=\s*'[^']*'/gi,
        to: `DECLARE @Date_To   DateTime = '\${DATE.sql.datetimeEnd}'`,
    },
    {
        re: /DECLARE\s+@Date_From\s+DATE\s*=\s*'[^']*'/gi,
        to: `DECLARE @Date_From DATE = '\${DATE.sql.start}'`,
    },
    {
        re: /DECLARE\s+@Date_To\s+DATE\s*=\s*'[^']*'/gi,
        to: `DECLARE @Date_To   DATE = '\${DATE.sql.end}'`,
    },
    {
        re: /SET\s+@SalesDate_From\s*=\s*'[^']*'/gi,
        to: `SET @SalesDate_From = '\${DATE.sql.start}'`,
    },
    {
        re: /SET\s+@SalesDate_To\s*=\s*'[^']*'/gi,
        to: `SET @SalesDate_To   = '\${DATE.sql.end}'`,
    },
    {
        re: /WHERE\s+deposit_date\s*>=\s*'[^']*'/gi,
        to: `WHERE deposit_date >= '\${DATE.sql.start}'`,
    },
    {
        re: /AND\s+deposit_date\s*<\s*'[^']*'/gi,
        to: `AND deposit_date < '\${DATE.sql.end}'`,
    },
    {
        re: /WHERE\s+\[deposit_date\]\s+BETWEEN\s+'[^']*'\s+AND\s+'[^']*'/gi,
        to: `WHERE [deposit_date] BETWEEN '\${DATE.sql.start}' AND '\${DATE.sql.end}'`,
    },
    {
        re: /where\s+Year\s*\([^)]+\)\s*=\s*\d{4}/gi,
        to: `where Year(Date_Payment_Check) = \${DATE.sql.year}`,
    },
];

// ─────────────────────────────────────────────────────────────
//  STEP 3 — BACKTICK CONVERTER
//
//  Walks the file character-by-character. When it finds a
//  single- or double-quoted JS string whose body contains
//  ${DATE.  it rewraps it in backticks so Node interpolates it.
// ─────────────────────────────────────────────────────────────
function convertQuotedTemplatesToBackticks(content) {
    if (!content.includes('${DATE.')) return content;

    const result = [];
    let i = 0;
    const len = content.length;

    while (i < len) {
        const ch = content[i];

        // Already a backtick string — pass through untouched
        if (ch === '`') {
            result.push(ch);
            i++;
            while (i < len) {
                const c = content[i];
                result.push(c);
                if (c === '\\') { i++; if (i < len) { result.push(content[i]); i++; } continue; }
                if (c === '`') { i++; break; }
                i++;
            }
            continue;
        }

        // Single-line comment — pass through
        if (ch === '/' && content[i + 1] === '/') {
            while (i < len && content[i] !== '\n') result.push(content[i++]);
            continue;
        }

        // Multi-line comment — pass through
        if (ch === '/' && content[i + 1] === '*') {
            result.push(content[i++]); result.push(content[i++]);
            while (i < len) {
                if (content[i] === '*' && content[i + 1] === '/') {
                    result.push(content[i++]); result.push(content[i++]); break;
                }
                result.push(content[i++]);
            }
            continue;
        }

        // Quoted string
        if (ch === "'" || ch === '"') {
            const quote = ch;
            let str = quote;
            let j = i + 1;
            while (j < len) {
                const c = content[j];
                str += c;
                if (c === '\\') { j++; if (j < len) { str += content[j++]; } continue; }
                if (c === quote) { j++; break; }
                j++;
            }

            const body = str.slice(1, -1);
            if (body.includes('${DATE.')) {
                // Unescape escaped quotes that are no longer needed
                const unescaped = body.replace(new RegExp(`\\\\${quote}`, 'g'), quote);
                result.push('`', unescaped, '`');
            } else {
                result.push(str);
            }

            i = j;
            continue;
        }

        result.push(ch);
        i++;
    }

    return result.join('');
}

// ─────────────────────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────────────────────
let totalFixed   = 0;
let totalSkipped = 0;

const branches = fs.readdirSync(CONTROLLERS_DIR).filter(name =>
    fs.statSync(path.join(CONTROLLERS_DIR, name)).isDirectory()
);

console.log(`\n🔍 Scanning ${branches.length} branch folder(s) under ./controllers/\n`);

for (const branch of branches) {
    const branchDir = path.join(CONTROLLERS_DIR, branch);
    const files = fs.readdirSync(branchDir).filter(f => f.endsWith('.js'));

    for (const file of files) {
        const filePath = path.join(branchDir, file);
        let content = fs.readFileSync(filePath, 'utf8');
        const original = content;

        // 1. Patch import to include DATE
        content = patchImport(content);

        // 2. Replace hardcoded date values with ${DATE.sql.*} placeholders
        for (const { re, to } of PATTERNS) {
            content = content.replace(re, to);
        }

        // 3. Convert quoted strings containing ${DATE. to backtick literals
        content = convertQuotedTemplatesToBackticks(content);

        if (content !== original) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`  ✅ Patched : controllers/${branch}/${file}`);
            totalFixed++;
        } else {
            console.log(`  ⏭️  Skipped : controllers/${branch}/${file}  (no changes needed)`);
            totalSkipped++;
        }
    }
}

console.log(`\n${'─'.repeat(55)}`);
console.log(`✅ Patched  : ${totalFixed} file(s)`);
console.log(`⏭️  Skipped  : ${totalSkipped} file(s) (already up to date)`);
console.log(`${'─'.repeat(55)}`);
console.log(`\n📅 Edit  config.js → DATE  to change the sync range.\n`);