import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobePath from 'ffprobe-static';

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath as unknown as string);
}

if (ffprobePath?.path) {
  ffmpeg.setFfprobePath(ffprobePath.path);
}

export const ffmpegConfigured = ffmpeg;

