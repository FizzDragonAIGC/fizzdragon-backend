import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { promisify } from 'util';
import PDFParser from 'pdf2json';

const execFileAsync = promisify(execFile);
const TEMP_PREFIX = path.join(tmpdir(), 'fizzdragon-attachment-');
const DEFAULT_ATTACHMENT_BASES = [
  process.env.OSS_PUBLIC_BASE_URL,
  process.env.TOOL_IMG_BASE_URL,
  'https://fizzspace-test.oss-cn-hangzhou.aliyuncs.com',
  'https://shotive.oss-cn-hangzhou.aliyuncs.com',
  'https://fizzstudio-sg.oss-ap-southeast-1.aliyuncs.com'
].filter(Boolean);

function normalizeText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u0000/g, '')
    .trim();
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function guessExtension(source, attachmentName = '') {
  const candidates = [attachmentName, source]
    .filter(Boolean)
    .map((value) => {
      try {
        return isHttpUrl(value) ? new URL(value).pathname : value;
      } catch {
        return value;
      }
    });

  for (const candidate of candidates) {
    const ext = path.extname(candidate).toLowerCase();
    if (ext) return ext;
  }
  return '';
}

function buildCandidateUrls(attachmentPath) {
  if (!attachmentPath) return [];
  if (isHttpUrl(attachmentPath)) return [attachmentPath];

  const normalizedPath = String(attachmentPath).replace(/^\/+/, '');
  return DEFAULT_ATTACHMENT_BASES.map((baseUrl) => `${baseUrl.replace(/\/+$/, '')}/${normalizedPath}`);
}

async function downloadRemoteAttachment(attachmentUrl, attachmentName = '') {
  const response = await fetch(attachmentUrl);
  if (!response.ok) {
    throw new Error(`Attachment download failed: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const tempDir = await mkdtemp(TEMP_PREFIX);
  const urlPath = (() => {
    try {
      return new URL(attachmentUrl).pathname;
    } catch {
      return '';
    }
  })();
  const fileName = path.basename(attachmentName || urlPath || 'attachment.bin');
  const filePath = path.join(tempDir, fileName);

  await writeFile(filePath, Buffer.from(arrayBuffer));
  return {
    filePath,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true });
    }
  };
}

function extractPdfWithPdf2Json(filePath) {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser();
    parser.on('pdfParser_dataError', (error) => {
      reject(new Error(error?.parserError || error?.message || 'pdf2json parse failed'));
    });
    parser.on('pdfParser_dataReady', (pdfData) => {
      const text = (pdfData?.Pages || [])
        .map((page) => (page?.Texts || [])
          .map((item) => decodeURIComponent((item?.R || []).map((run) => run?.T || '').join('')))
          .join(' '))
        .join('\n');
      resolve(normalizeText(text));
    });
    parser.loadPDF(filePath);
  });
}

async function extractTextFromFile(filePath, extension) {
  if (extension === '.txt' || extension === '.md') {
    return normalizeText(await readFile(filePath, 'utf8'));
  }

  if (extension === '.doc' || extension === '.docx') {
    const { stdout } = await execFileAsync('textutil', ['-convert', 'txt', '-stdout', filePath], {
      maxBuffer: 1024 * 1024 * 20
    });
    return normalizeText(stdout);
  }

  if (extension === '.pdf') {
    try {
      const { stdout } = await execFileAsync('pdftotext', ['-layout', filePath, '-'], {
        maxBuffer: 1024 * 1024 * 20
      });
      return normalizeText(stdout);
    } catch (error) {
      const fallbackText = await extractPdfWithPdf2Json(filePath);
      if (fallbackText) return fallbackText;
      throw error;
    }
  }

  throw new Error(`Unsupported attachment extension: ${extension || 'unknown'}`);
}

async function resolveAttachmentFile(body) {
  const attachmentUrl = String(body?.novelAttachmentUrl || '').trim();
  if (attachmentUrl) {
    return {
      ...(await downloadRemoteAttachment(attachmentUrl, body?.novelAttachmentName)),
      sourceType: 'remote-url',
      source: attachmentUrl
    };
  }

  const attachmentPath = String(body?.novelAttachment || '').trim();
  if (!attachmentPath) return null;

  if (existsSync(attachmentPath)) {
    return {
      filePath: attachmentPath,
      cleanup: null,
      sourceType: 'local-file',
      source: attachmentPath
    };
  }

  const candidateUrls = buildCandidateUrls(attachmentPath);
  let lastError = null;
  for (const candidateUrl of candidateUrls) {
    try {
      return {
        ...(await downloadRemoteAttachment(candidateUrl, body?.novelAttachmentName || attachmentPath)),
        sourceType: 'remote-candidate',
        source: candidateUrl
      };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error('Attachment source is not readable');
}

export async function ensureNovelTextFromAttachment(body, options = {}) {
  const logger = options.logger;

  if (normalizeText(body?.novelText)) {
    logger?.debug?.('Novel text already present; skip attachment extraction', {
      novelTextLength: String(body?.novelText || '').trim().length
    });
    return body.novelText;
  }

  const resolved = await resolveAttachmentFile(body);
  if (!resolved) return body?.novelText || '';

  const extension = guessExtension(resolved.filePath, body?.novelAttachmentName || body?.novelAttachmentUrl || body?.novelAttachment);
  try {
    logger?.info?.('Resolved novel attachment', {
      sourceType: resolved.sourceType,
      source: resolved.source,
      filePath: resolved.filePath,
      extension
    });
    const extractedText = await extractTextFromFile(resolved.filePath, extension);
    if (!extractedText) {
      throw new Error('Attachment text extraction returned empty content');
    }
    body.novelText = extractedText;
    logger?.info?.('Extracted novel text from attachment', {
      sourceType: resolved.sourceType,
      extension,
      extractedTextLength: extractedText.length
    });
    return extractedText;
  } finally {
    if (typeof resolved.cleanup === 'function') {
      await resolved.cleanup();
      logger?.debug?.('Cleaned up temporary attachment file', {
        sourceType: resolved.sourceType,
        source: resolved.source
      });
    }
  }
}
