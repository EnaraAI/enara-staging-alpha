// lms-speed-3: Tailwind at build time (tailwind.config.js), run on tailwind.css only, so the other
// CSS files (kids, parents, bus, Leaflet) are bundled exactly as before. autoprefixer({ remove: false })
// is what the former in-browser compiler (cdn.tailwindcss.com) ran after Tailwind.
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

const tailwindOnly = () => {
  const processor = postcss([tailwindcss(), autoprefixer({ remove: false })]);
  return {
    postcssPlugin: 'enara-tailwind-only',
    async Once(root, { result }) {
      const file = root.source?.input.file ?? '';
      if (!/[\\/]tailwind\.css$/.test(file)) return;
      const out = await processor.process(root.toString(), { from: file });
      root.removeAll();
      root.append(out.root.nodes);
      result.messages.push(...out.messages); // file dependencies, for the dev server
    },
  };
};
tailwindOnly.postcss = true;

export default { plugins: [tailwindOnly()] };
