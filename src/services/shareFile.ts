import { File, Paths } from 'expo-file-system';
import { getDocumentAsync } from 'expo-document-picker';
import { isAvailableAsync, shareAsync, type SharingOptions } from 'expo-sharing';

function fileName(filename: string): string {
  const base = filename.trim().split(/[/\\]/).pop() ?? '';
  if (base.length === 0 || base === '.' || base === '..') {
    throw new Error('The file name is not valid');
  }
  return base;
}

function utiForMime(mimeType: string): string | undefined {
  if (mimeType === 'application/json') {
    return 'public.json';
  }
  if (mimeType === 'text/plain') {
    return 'public.plain-text';
  }
  if (mimeType === 'text/csv') {
    return 'public.comma-separated-values-text';
  }
  if (mimeType === 'application/x-sqlite3' || mimeType === 'application/vnd.sqlite3') {
    return 'public.database';
  }
  if (mimeType === 'application/octet-stream') {
    return 'public.data';
  }
  return undefined;
}

function isCancel(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return message.includes('cancel');
}

async function shareUri(uri: string, mimeType: string): Promise<void> {
  const available = await isAvailableAsync();
  if (!available) {
    throw new Error('Sharing is not available on this device');
  }
  const options: SharingOptions = { mimeType };
  const uti = utiForMime(mimeType);
  if (uti) {
    options.UTI = uti;
  }
  await shareAsync(uri, options);
}

export async function shareTextFile(
  filename: string,
  contents: string,
  mimeType: string,
): Promise<void> {
  const file = new File(Paths.document, fileName(filename));
  if (!file.exists) {
    file.create({ intermediates: true });
  }
  file.write(contents);
  await shareUri(file.uri, mimeType);
}

export async function pickTextFile(): Promise<string | null> {
  let picked;
  try {
    picked = await getDocumentAsync({
      type: ['application/json', '*/*'],
      copyToCacheDirectory: true,
      multiple: false,
      base64: false,
    });
  } catch (error) {
    if (isCancel(error)) {
      return null;
    }
    throw error instanceof Error ? error : new Error('Could not open the file picker');
  }
  if (picked.canceled || picked.assets == null || picked.assets.length === 0) {
    return null;
  }
  const asset = picked.assets[0];
  if (asset.file) {
    return asset.file.text();
  }
  return new File(asset.uri).text();
}

export async function shareFileAt(uri: string, mimeType: string): Promise<void> {
  await shareUri(uri, mimeType);
}
