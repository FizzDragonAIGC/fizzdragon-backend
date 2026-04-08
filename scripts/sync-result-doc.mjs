import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const docPath = join(rootDir, 'docs', 'result.md');
const projectId = 'avatar_full_test';

function loadScreenplayText(episodeIndex, fileName) {
  const filePath = join(rootDir, 'result', fileName);
  if (existsSync(filePath)) {
    const payload = JSON.parse(readFileSync(filePath, 'utf8'));
    return payload.result || payload.fullText || payload.text || '';
  }

  const publicPath = join(rootDir, 'user_projects', '_public.json');
  const publicData = JSON.parse(readFileSync(publicPath, 'utf8'));
  const fromContext = publicData[projectId]?.data?.context?.screenplays?.[String(episodeIndex)]
    || publicData[projectId]?.data?.context?.screenplays?.[episodeIndex];

  if (!fromContext) {
    throw new Error(`Missing screenplay source for episodeIndex=${episodeIndex} (${fileName})`);
  }

  return fromContext;
}

function replaceCodeBlock(docText, sectionHeading, screenplayText) {
  const pattern = new RegExp(
    `(## ${sectionHeading}[\\s\\S]*?### 测试响应[^\\n]*\\n\\n\`\`\`\\n)([\\s\\S]*?)(\\n\`\`\`)`
  );

  if (!pattern.test(docText)) {
    throw new Error(`Marker not found for section "${sectionHeading}"`);
  }

  return docText.replace(pattern, `$1${screenplayText}$3`);
}

let docText = readFileSync(docPath, 'utf8');

docText = replaceCodeBlock(docText, '5\\. screenplay E001', loadScreenplayText(0, 'screenplay_e001.json'));
docText = replaceCodeBlock(docText, '6\\. screenplay E002（Part 5b 自动注入）', loadScreenplayText(1, 'screenplay_e002.json'));
docText = replaceCodeBlock(docText, '7\\. screenplay E003（链式连续性）', loadScreenplayText(2, 'screenplay_e003.json'));

writeFileSync(docPath, docText);
console.log(`Synced screenplay sections in ${docPath}`);
