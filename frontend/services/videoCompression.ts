import type { FFmpeg } from '@ffmpeg/ffmpeg';

// Compresses lesson videos in the browser before they go to storage: H.264 at
// most 720p (CRF 28) with 96 kb/s AAC audio and fast-start for streaming.
// ffmpeg.wasm (~30 MB) is loaded only the first time a video is compressed.

// The single-threaded WASM build keeps memory bounded; larger inputs are uploaded as-is.
export const MAX_COMPRESS_INPUT_BYTES = 500 * 1024 * 1024;

let ffmpegPromise: Promise<FFmpeg> | undefined;

function loadFfmpeg(): Promise<FFmpeg> {
  ffmpegPromise ??= (async () => {
    const [{ FFmpeg }, { default: coreURL }, { default: wasmURL }] = await Promise.all([
      import('@ffmpeg/ffmpeg'),
      import('@ffmpeg/core?url'),
      import('@ffmpeg/core/wasm?url'),
    ]);
    const ffmpeg = new FFmpeg();
    await ffmpeg.load({ coreURL, wasmURL });
    return ffmpeg;
  })().catch((err) => {
    ffmpegPromise = undefined;
    throw err;
  });
  return ffmpegPromise;
}

export interface CompressedVideo {
  file: File;
  compressed: boolean;
  originalBytes: number;
}

// Returns the compressed MP4, or the original file when compression can't help
// (too large to process in the browser, failed, or the result isn't smaller).
export async function compressVideo(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<CompressedVideo> {
  const original: CompressedVideo = { file, compressed: false, originalBytes: file.size };
  if (file.size > MAX_COMPRESS_INPUT_BYTES) return original;

  const { fetchFile } = await import('@ffmpeg/util');
  const ffmpeg = await loadFfmpeg();
  const report = ({ progress }: { progress: number }) => onProgress?.(Math.min(1, Math.max(0, progress)));
  ffmpeg.on('progress', report);

  const input = `input${file.name.slice(file.name.lastIndexOf('.')) || '.mp4'}`;
  const output = 'output.mp4';
  try {
    await ffmpeg.writeFile(input, await fetchFile(file));
    const code = await ffmpeg.exec([
      '-i', input,
      '-vf', "scale=-2:'min(720,ih)'",
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '96k',
      '-movflags', '+faststart',
      output,
    ]);
    if (code !== 0) return original;
    const data = (await ffmpeg.readFile(output)) as Uint8Array;
    if (data.byteLength === 0 || data.byteLength >= file.size) return original;
    const name = file.name.replace(/\.[^.]+$/, '') + '.mp4';
    return { file: new File([data], name, { type: 'video/mp4' }), compressed: true, originalBytes: file.size };
  } catch {
    return original;
  } finally {
    ffmpeg.off('progress', report);
    await ffmpeg.deleteFile(input).catch(() => {});
    await ffmpeg.deleteFile(output).catch(() => {});
  }
}
