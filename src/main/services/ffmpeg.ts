import ffmpeg from 'fluent-ffmpeg';
import { FFMPEG_PATH, FFPROBE_PATH } from './binaries.js';

ffmpeg.setFfmpegPath(FFMPEG_PATH);

ffmpeg.setFfprobePath(FFPROBE_PATH);

export const ffmpegConfigured = ffmpeg;
