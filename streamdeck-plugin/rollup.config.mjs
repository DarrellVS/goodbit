import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';

/**
 * One file, into the plugin folder, because that is what `CodePath` names and
 * the Stream Deck app runs it with its own bundled Node rather than with
 * anything installed here.
 */
export default {
  input: 'src/plugin.ts',
  output: {
    file: 'io.github.darrellvs.goodbit.sdPlugin/bin/plugin.js',
    format: 'esm',
    sourcemap: true,
  },
  plugins: [typescript(), nodeResolve({ browser: false, preferBuiltins: true }), commonjs()],
};
