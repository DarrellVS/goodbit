import { describe, expect, it } from 'vitest';
import {
  ffmpegCommand,
  parseOutTime,
  ProgressParser,
} from '../../../src/main/services/ffmpegProcess.js';

/**
 * The half of the ffmpeg runner that takes values and returns values.
 *
 * `fluent-ffmpeg` scraped progress out of the human readable stats ffmpeg
 * prints to stderr, and nothing checked it: a rewrite that silently stopped
 * reporting would look exactly like a long export. `-progress pipe:1` is a
 * machine readable stream instead, and this is what reads it.
 *
 * Argument assembly is here for the same reason. It is the one thing the
 * wrapper did that every media path depends on, and a command can now be read
 * back in a test, which a `FfmpegCommand` never could.
 */

describe('parseOutTime', () => {
  it('reads ffmpeg own HH:MM:SS.microseconds', () => {
    expect(parseOutTime('00:00:00.500000')).toBeCloseTo(0.5, 6);
    expect(parseOutTime('00:01:30.250000')).toBeCloseTo(90.25, 6);
    expect(parseOutTime('01:00:00.000000')).toBeCloseTo(3600, 6);
  });

  it('refuses what ffmpeg emits before it has produced a frame', () => {
    // Both of these really come out of ffmpeg, on the first progress block of
    // a command that is still opening its inputs. Reported as a sample they
    // would send a progress bar to zero, or to a negative fraction.
    expect(parseOutTime('-577014:32:22.000000')).toBeNull();
    expect(parseOutTime('N/A')).toBeNull();
    expect(parseOutTime('')).toBeNull();
  });
});

describe('ProgressParser', () => {
  it('reads one sample per progress block', () => {
    const parser = new ProgressParser();
    const samples = parser.push(
      [
        'frame=30',
        'fps=29.9',
        'out_time_us=1000000',
        'progress=continue',
        'frame=60',
        'out_time_us=2000000',
        'progress=end',
        '',
      ].join('\n'),
    );

    expect(samples).toEqual([1, 2]);
  });

  it('holds a line that a read cut in half', () => {
    // A pipe splits wherever it likes. Without the buffer, `out_tim` and
    // `e_us=3000000` are two unreadable lines and that sample is simply lost,
    // which shows up as a progress bar that stalls and then jumps.
    const parser = new ProgressParser();

    expect(parser.push('frame=90\nout_tim')).toEqual([]);
    expect(parser.push('e_us=3000000\nprogress=continue\n')).toEqual([3]);
  });

  it('falls back to out_time when out_time_us is absent', () => {
    const parser = new ProgressParser();
    expect(parser.push('out_time=00:00:04.500000\nprogress=continue\n')).toEqual([4.5]);
  });

  it('ignores out_time_ms, which carries microseconds despite its name', () => {
    // A long-standing misnomer in ffmpeg. Read as milliseconds it reports a
    // one second clip as a thousand seconds done, so the fraction pins at 1
    // from the first block and the bar never moves again.
    const parser = new ProgressParser();
    expect(parser.push('out_time_ms=5000000\nprogress=continue\n')).toEqual([]);
  });

  it('drops the garbage first block rather than reporting it', () => {
    const parser = new ProgressParser();
    expect(parser.push('out_time=-577014:32:22.000000\nprogress=continue\n')).toEqual([]);
  });
});

describe('ffmpegCommand', () => {
  it('puts each input options before its own -i', () => {
    // Not a detail: `-hwaccel` binds to the input that follows it, and a
    // dissolve can want the GPU for one of its two files and not the other.
    const args = ffmpegCommand()
      .input('a.mp4')
      .inputOptions(['-hwaccel cuda'])
      .input('b.mp4')
      .inputOptions(['-ss 4.000'])
      .outputOptions(['-c:v copy'])
      .output('out.mp4')
      .args();

    expect(args).toEqual([
      '-hwaccel', 'cuda',
      '-i', 'a.mp4',
      '-ss', '4.000',
      '-i', 'b.mp4',
      '-y',
      '-c:v', 'copy',
      'out.mp4',
    ]);
  });

  it('splits an option of exactly two parts and leaves anything else whole', () => {
    // The rule the wrapper used, kept because every call site in main was
    // written against it. A filter graph carrying one space would be cut in
    // half by it, which is why a graph goes through complexFilter().
    const args = ffmpegCommand('in.mp4')
      .outputOptions(['-vn', '-t 4.500', '-af volume=2:eval=frame'])
      .output('out.mp4')
      .args();

    expect(args).toEqual([
      '-i', 'in.mp4',
      '-y',
      '-vn',
      '-t', '4.500',
      '-af', 'volume=2:eval=frame',
      'out.mp4',
    ]);
  });

  it('joins a filter graph with semicolons and never splits it', () => {
    const args = ffmpegCommand('in.mp4')
      .complexFilter(['[0:v:0]scale=2:2[v]', '[0:a][1:a]amix=inputs=2[a]'])
      .outputOptions(['-map [v]'])
      .output('out.mp4')
      .args();

    expect(args).toContain('-filter_complex');
    expect(args[args.indexOf('-filter_complex') + 1]).toBe(
      '[0:v:0]scale=2:2[v];[0:a][1:a]amix=inputs=2[a]',
    );
  });

  it('always overwrites, because several call sites never asked to', () => {
    // The wrapper added `-y` itself for a file output. Dropping it would leave
    // a thumbnail rebuild blocked forever on a cache path that already exists,
    // with nothing on screen to say so.
    const args = ffmpegCommand('in.mp4').output('out.jpg').args();
    expect(args).toContain('-y');
  });

  it('refuses a command with no output rather than spawning one', () => {
    expect(() => ffmpegCommand('in.mp4').args()).toThrow(/no output/);
  });

  it('seeks on the input side, before decoding', () => {
    const args = ffmpegCommand('in.mp4').seekInput(12.5).frames(1).output('out.jpg').args();
    expect(args.slice(0, 4)).toEqual(['-ss', '12.5', '-i', 'in.mp4']);
    expect(args).toContain('-frames:v');
  });
});
