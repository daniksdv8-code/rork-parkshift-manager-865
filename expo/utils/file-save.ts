import { Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';

export async function saveFile(content: string, filename: string, mimeType: string): Promise<{ success: boolean; fallback?: boolean }> {
  if (Platform.OS === 'web') {
    return saveFileWeb(content, filename, mimeType);
  }
  return saveFileNative(content, filename, mimeType);
}

async function saveFileWeb(content: string, filename: string, _mimeType: string): Promise<{ success: boolean; fallback?: boolean }> {
  try {
    const blob = new Blob([content], { type: _mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { success: true };
  } catch (e) {
    console.log('[FileSave] Web download failed, falling back to clipboard:', e);
    try {
      await Clipboard.setStringAsync(content);
      return { success: true, fallback: true };
    } catch {
      return { success: false };
    }
  }
}

async function saveFileNative(content: string, filename: string, _mimeType: string): Promise<{ success: boolean; fallback?: boolean }> {
  try {
    await Share.share({
      message: content,
      title: filename,
    });
    return { success: true };
  } catch (e) {
    console.log('[FileSave] Native share failed, falling back to clipboard:', e);
    try {
      await Clipboard.setStringAsync(content);
      return { success: true, fallback: true };
    } catch {
      return { success: false };
    }
  }
}

export async function shareCsv(csvContent: string, filename: string): Promise<{ success: boolean; fallback?: boolean }> {
  return saveFile(csvContent, filename, 'text/csv');
}

export async function shareJson(jsonContent: string, filename: string): Promise<{ success: boolean; fallback?: boolean }> {
  return saveFile(jsonContent, filename, 'application/json');
}
